# 🌰 Bellota — una wallet Cashu en 3D

> Tus sats son bellotas que caen dentro de un frasco.

**Bellota** es una wallet web de [Cashu](https://cashu.space) (ecash para Bitcoin) donde cada *proof* es una moneda-bellota física en 3D. Recibís por Lightning y caen al frasco; mandás ecash y salen volando; pagás una invoice y se derriten en un rayo. Estética de dibujo animado (cel-shading + contornos de tinta) con una interfaz moderna estilo neo-brutalista.

**▶ Probala: [negr087.github.io/bellota](https://negr087.github.io/bellota/)** · [modo demo sin red](https://negr087.github.io/bellota/?demo)

Hecha para la hackathon **[Nut November 2026](https://nutnovember.org)** · #NutNovember

## Qué hace

| | |
|---|---|
| ⚡ → 🌰 **Recibir por Lightning** | Crea una invoice (NUT-04), espera el pago y emite las bellotas. Las invoices pendientes se siguen revisando aunque cierres la app. |
| 🌰 **Cobrar ecash** | Pegás un token `cashuA…`/`cashuB…`, muestra monto, mint y nota antes de cobrar. Si el mint es nuevo te avisa y lo agrega. |
| 🌰 → 🎁 **Enviar ecash** | Arma un token (con nota opcional) en texto + QR. Desde el historial podés ver si ya lo cobraron (NUT-07) y **recuperarlo** si no. |
| 🌰 → ⚡ **Pagar Lightning** | Cotiza la invoice (NUT-05) mostrando monto + reserva de comisión, paga y guarda el vuelto (NUT-08). Si el pago falla, recupera las proofs que no se gastaron. |
| 🏦 **Multi-mint** | Cada mint es un frasco distinto. Agregar, cambiar y quitar mints. |
| ⏳ **Pagos a prueba de cierres** | Antes de pagar, las proofs se guardan como "en tránsito". Si cerrás la pestaña o el pago queda pendiente, al volver la app le pregunta al mint (NUT-05/07) y te devuelve lo que no se gastó. |
| 🔐 **Respaldo** | Exporta un token por mint con todo el saldo. |
| 🧸 **Modo demo** | Mint de juguete sin red, para probar la experiencia sin sats reales. |

### El frasco 3D

- Cada **proof** es una moneda. Cashu parte los montos en potencias de 2, así que el tamaño y el color de la bellota dicen cuánto vale: cobre (1–2), ámbar (4–16), oro (32–128), menta (256–2048), uva (4096+).
- Física real (Rapier): las monedas caen, rebotan y se apilan.
- Tocá una bellota para ver su valor; tocá el frasco (o 🫨) para agitarlo.
- La tapa es un sombrerito de bellota que se abre cuando entran o salen monedas.
- Si el navegador no soporta WebGL, la wallet funciona igual sin el 3D.

## Correrla

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # build de producción en dist/ (Vercel, Netlify, GitHub Pages…)
npm run build:demo   # un solo index.html autocontenido en modo demo (dist-demo/)
```

Agregá `?demo` a la URL para entrar directo al modo demo.

Por defecto usa **testnut.cashu.space**, un mint de prueba con sats falsos donde las invoices se pagan solas: ideal para probar. Para sats reales, agregá un mint como `mint.minibits.cash/Bitcoin` desde 🏦.

## Stack

- React 18 + Vite (JavaScript plano)
- [`@cashu/cashu-ts`](https://github.com/cashubtc/cashu-ts) v4
- three.js + @react-three/fiber + drei + @react-three/rapier
- Fredoka + Space Grotesk (empaquetadas, sin CDNs)

```
src/
  lib/cashu.js       backend real (cashu-ts): mint, melt, send, receive, estados
  lib/demo.js        mismo contrato, pero con un mint de juguete en memoria
  lib/useWallet.js   estado, persistencia (localStorage) y acciones
  three/             frasco, monedas, física, materiales toon y contornos
  ui/                sheets de recibir / enviar / mints / historial
```

## ⚠️ Advertencias

- Es software experimental de hackathon: **usá montos chicos**.
- El ecash vive en el `localStorage` del navegador. Si borrás los datos del sitio sin haber exportado un respaldo, se pierde.
- Todavía no usa semilla determinística (NUT-13): el respaldo es por tokens.
- Cashu es custodial: el mint guarda los sats. Elegí mints en los que confíes.

## Próximos pasos

- Semilla BIP-39 + restore (NUT-13)
- Guardar las proofs cifradas en Nostr (NIP-60) y recibir nutzaps (NIP-61)
- Escanear QR con la cámara
- Pagar Lightning Addresses y payment requests (NUT-18)

## Licencia

MIT © 2026 Sebastián ([@negr0](https://njump.me/negr0) en Nostr)
