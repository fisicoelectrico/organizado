// ORGANIZADO$ · Edge Function «leer-factura» (fase 1, v3.0)
// Recibe la foto de una factura (base64), comprueba que quien llama sea administrador
// y le pide a Claude las líneas de la factura como JSON. No guarda la foto en ningún lado.
//
// Secretos (Supabase › Edge Functions › Secrets):
//   ANTHROPIC_API_KEY   obligatorio
//   MODELO_FACTURAS     opcional (por defecto claude-opus-5-5; claude-haiku-5-5 cuesta mucho menos)
//   TOPE_DIARIO         opcional (lecturas por día y por usuario, por defecto 40)
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const ORIGENES = [/^https:\/\/fisicoelectrico\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_B64 = 5_000_000; // ~3,7 MB de imagen

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENES.some((r) => r.test(o)) ? o : "https://fisicoelectrico.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["es_factura", "tienda", "fecha", "total", "items"],
  properties: {
    es_factura: { type: "boolean" },
    tienda: { type: "string" },
    fecha: { type: "string", description: "AAAA-MM-DD o vacío si no se lee" },
    total: { type: "number", description: "Total a pagar de la factura, 0 si no se lee" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["texto", "producto", "unidad", "cantidad", "contenido", "precio_total", "seguro"],
        properties: {
          texto: { type: "string", description: "Descripción tal como aparece impresa" },
          producto: { type: "string", description: "Nombre genérico y claro en español" },
          unidad: { type: "string", enum: ["kg", "l", "und"] },
          cantidad: { type: "number", description: "Número de empaques o unidades compradas" },
          contenido: { type: "number", description: "Contenido de un empaque en la unidad base (900 ml = 0.9 l)" },
          precio_total: { type: "number", description: "Lo pagado por la línea, en pesos, después de descuentos" },
          seguro: { type: "boolean", description: "false si algún dato de la línea es dudoso" },
        },
      },
    },
  },
};

const INSTRUCCIONES = `Lees fotos de facturas y tiquetes de supermercado en Colombia (pesos colombianos, COP).
Devuelve cada producto comprado como una línea. Reglas:
- Precios en pesos enteros: "12.900" o "12,900" es 12900. Nunca inventes decimales de centavos.
- precio_total es lo que se pagó por esa línea después de descuentos de la misma línea. Si un descuento aparece en una línea aparte justo debajo, réstalo del producto al que pertenece y no lo devuelvas como línea.
- No incluyas como productos: subtotales, IVA, impuestos, bolsas plásticas (impuesto a la bolsa), propinas, cambio, medios de pago ni puntos.
- cantidad: número de empaques. Si el producto se vende al peso (frutas, verduras, carnes, queso por gramos), unidad "kg", cantidad 1 y contenido = kilos pesados.
- contenido: tamaño de un empaque en la unidad base, sacado del texto (ARROZ 500G -> kg, 0.5; ACEITE 3000ML -> l, 3; HUEVOS X30 -> und, 30). Si no se puede saber, unidad "und" y contenido 1.
- producto: nombre genérico y corto, sin marca ni tamaño ("CREMA LECHE ALQ 900ML" -> "Crema de leche"). Si coincide con uno de la lista de productos conocidos del usuario, usa ese nombre exacto.
- seguro = false si la línea está borrosa o alguno de sus números es dudoso.
- fecha en formato AAAA-MM-DD. tienda es el nombre comercial.
- Si la imagen no es una factura de compra, es_factura = false e items vacío.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "Método no permitido" });

  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: u } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return json(req, 401, { error: "Inicia sesión para usar esta función" });
  const { data: admin } = await sb.rpc("es_admin");
  if (admin !== true) return json(req, 403, { error: "Función solo para el administrador" });

  // Tope diario de lecturas (protege tu saldo de la API)
  const tope = Number(Deno.env.get("TOPE_DIARIO") ?? 40);
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await sb.from("lecturas_factura").select("id", { count: "exact", head: true }).gte("created_at", desde);
  if ((count ?? 0) >= tope) return json(req, 429, { error: `Llegaste al tope de ${tope} lecturas en 24 horas` });

  let body: { imagen?: string; tipo?: string };
  try { body = await req.json(); } catch { return json(req, 400, { error: "Solicitud inválida" }); }
  const imagen = String(body.imagen ?? "").replace(/^data:[^,]+,/, "");
  const tipo = String(body.tipo ?? "image/jpeg");
  if (!imagen || !TIPOS.has(tipo)) return json(req, 400, { error: "Falta la imagen (JPG, PNG o WebP)" });
  if (imagen.length > MAX_B64) return json(req, 413, { error: "La imagen es muy pesada" });

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json(req, 500, { error: "Falta configurar ANTHROPIC_API_KEY en Supabase" });

  const { data: prods } = await sb.from("productos").select("nombre").order("nombre").limit(400);
  const conocidos = (prods ?? []).map((p: { nombre: string }) => p.nombre).join(", ") || "(ninguno aún)";

  await sb.from("lecturas_factura").insert({});

  const modelo = Deno.env.get("MODELO_FACTURAS") || "claude-opus-5-5";
  const client = new Anthropic({ apiKey: key });
  try {
    const params: Record<string, unknown> = {
      model: modelo,
      max_tokens: 16000,
      system: INSTRUCCIONES,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: tipo, data: imagen } },
          { type: "text", text: `Productos conocidos del usuario: ${conocidos}\n\nExtrae la factura.` },
        ],
      }],
    };
    // Si el modelo declina por política, la API reintenta sola con el modelo recomendado
    if (/^claude-(opus-5|fable-5|sonnet-5-5)/.test(modelo)) {
      params.betas = ["server-side-fallback-2026-07-01"];
      params.fallbacks = "default";
    }
    // deno-lint-ignore no-explicit-any
    const r: any = await client.beta.messages.create(params as any);
    if (r.stop_reason === "refusal") return json(req, 422, { error: "El modelo no quiso leer esta imagen" });
    if (r.stop_reason === "max_tokens") return json(req, 422, { error: "La factura es demasiado larga; tómala en dos fotos" });
    const txt = r.content.find((b: { type: string }) => b.type === "text")?.text ?? "";
    const datos = JSON.parse(txt);
    return json(req, 200, { ...datos, modelo: r.model, uso: { entrada: r.usage?.input_tokens, salida: r.usage?.output_tokens } });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json(req, 502, { error: "La clave de Anthropic no es válida" });
    if (e instanceof Anthropic.RateLimitError) return json(req, 503, { error: "Anthropic está ocupado, intenta en un minuto" });
    if (e instanceof Anthropic.BadRequestError) return json(req, 502, { error: "Anthropic rechazó la solicitud: " + e.message.slice(0, 200) });
    if (e instanceof Anthropic.APIError) return json(req, 502, { error: `Error de Anthropic (${e.status})` });
    if (e instanceof SyntaxError) return json(req, 502, { error: "La respuesta no vino en el formato esperado" });
    return json(req, 500, { error: "No se pudo leer la factura" });
  }
});
