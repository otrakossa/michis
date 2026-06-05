# Prompt para Lovable — interfaces mejoradas de michis

> Pegar el bloque completo como **primer mensaje** en Lovable. Luego iterar una
> pantalla por mensaje. Cuando algo guste, identificar pantalla + elemento
> concreto para portarlo al código real (sistema de tokens/clases en
> `web/src/app/globals.css` y `web/src/lib/estados.ts`).

---

Crea una PWA mobile-first en español llamada "michis" 🐱: una plataforma para un
colectivo cerrado de ~200 activistas que investigan y denuncian coordinadamente
cuentas bot / contenido sintético en redes sociales, asistidos por una IA que
investiga y un flujo de aprobación humana. Usa React + Tailwind con datos mock
realistas en español. No necesito backend: todo simulado, pero con estados
interactivos (loading, vacío, éxito, error).

IDENTIDAD VISUAL — "Calor militante" (mejórala, pero respeta su espíritu):
- Oscuro cálido: fondo #1c1917, superficies #292524, bordes #44403c.
- Ámbar #f59e0b como ÚNICO color de acción (botones primarios con texto oscuro
  y peso 700+). Naranja #fb923c para alertas/estados de atención, verde #4ade80
  para bajo riesgo/éxito, rojo #f87171 para alto riesgo/peligro.
- Texto #fafaf9 / secundario #a8a29e. Esquinas muy redondeadas (12-16px),
  tipografía system-ui con títulos extrabold; handles y datos técnicos en
  monospace. Tono cercano y humano, de colectivo — NO corporativo.
- Los estados SIEMPRE en lenguaje humano: "esperando tu revisión", "la IA está
  investigando…", "borrador — editable", "pendiente de admin", "confirmado ✓".

ROLES: activista (investiga, revisa, participa) y admin (aprueba expedientes,
activa/cierra campañas). Incluye un toggle de rol para previsualizar ambos.

PANTALLAS (mejora jerarquía, microinteracciones y vacíos en todas):
1. Login: 🐱 michis centrado, email+contraseña, "acceso solo por invitación".
2. Nav superior: marca, Casos, Expedientes (solo admin), Campañas con badge
   ámbar del nº activas, usuario y rol.
3. Casos (lista): filtros por estado como chips, tarjetas con @handle (mono),
   plataforma (X/TikTok), estado humano y score si existe. FAB "+ Nuevo caso".
4. Nuevo caso: plataforma, @handle (normalización en vivo), notas "¿por qué te
   parece sospechosa?", aviso amable de duplicado con link al caso existente.
5. Detalle de caso (LA pantalla estrella, dale el mejor tratamiento):
   - Cabecera: @granja_bot_8821 · Twitter · "esperando tu revisión".
   - Veredicto de la IA: medidor circular grande con score 0-100 coloreado por
     riesgo, frase humana ("Muy probablemente es una cuenta sintética"),
     confianza, badges "modo degradado"/"parcial"; señales como chips con peso
     visual ●●●●○ (ej: "actividad 24/7", "texto duplicado con @otra_cuenta");
     cuentas vinculadas como chips clicables (sugieren red/granja).
   - Línea de tiempo de investigaciones (en cola → investigando… → lista).
   - Expediente: markdown editable en borrador, botones "Guardar" y "Elevar al
     admin →", estados con sello de quién/cuándo.
   - Si confirmado: CTA "📢 Activar campaña" (admin) o link a la campaña activa.
6. Expedientes (admin): cola de pendientes con score y quién elevó, acciones
   Aprobar / Devolver con confirmación.
7. Campañas: activas con barra de progreso ámbar→naranja y "147 / 200 ya
   reportaron"; cerradas con resultado ("cuenta suspendida"). Detalle:
   instrucciones, botón "🔗 Abrir mecanismo de reporte", botón grande
   "✋ Ya reporté" (idempotente: "ya habías reportado ✓"), cierre con resultado
   (admin).

MEJORAS QUE ESPERO DE TI: microinteracciones sutiles (el medidor anima al
cargar, la barra de campaña late suavemente), skeletons de carga, estados
vacíos con personalidad ("Ningún caso todavía — ¿viste algo raro en redes?"),
accesibilidad AA en contrastes, y navegación inferior tipo app en móvil.
Datos mock: 8-10 casos variados en español latinoamericano con scores diversos,
2 campañas activas y 1 cerrada.
