# Splitr — La cuenta, resuelta

App mobile-first para dividir boletas de restaurante usando IA. Sube una foto de la cuenta, describe lo que consumiste en lenguaje natural y Splitr calcula automáticamente tu parte, incluyendo propina.

🔗 **[splitr-boleta.vercel.app](https://splitr-boleta.vercel.app)**

---

## Cómo funciona

1. **Subir** — Fotografía la boleta (una o varias imágenes)
2. **Describir** *(opcional)* — Escribe o dicta qué consumiste: *"una cerveza y unas papas a medias"*
3. **Seleccionar** — La IA pre-selecciona tus ítems; ajusta cantidades y divisiones
4. **Resumen** — Ve tu total con propina y compártelo por WhatsApp

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Vite + React 18 + Tailwind CSS 3 |
| Backend | Vercel Serverless Function (Node.js) |
| IA / OCR | Anthropic Claude Sonnet (`claude-sonnet-4-6`) |
| Analytics | Vercel Analytics |
| Deploy | Vercel (branch `feature/splitr`) |

---

## Correr localmente

### Requisitos
- Node.js 18+
- [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`
- API key de [Anthropic](https://console.anthropic.com)

### Setup

```bash
# 1. Clonar el repo
git clone https://github.com/ricarachondo/personal-OS.git
cd personal-OS
git checkout feature/splitr

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus valores reales

# 4. Correr en modo desarrollo (incluye la función serverless /api/analyze)
vercel dev --listen 3001
```

La app quedará disponible en `http://localhost:3001`.

> **Nota:** Usar `vercel dev` en vez de `npm run dev` porque el segundo no levanta las funciones serverless de `/api`.

---

## Variables de entorno

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `ANTHROPIC_API_KEY` | API key de Anthropic para Claude | ✅ |
| `SPLITR_TOKEN` | Token de autenticación del endpoint `/api/analyze` (servidor) | ✅ |
| `VITE_SPLITR_TOKEN` | Mismo token, expuesto al frontend via Vite para incluirlo en cada request | ✅ |

Ver `.env.example` para el formato. Ambos tokens (`SPLITR_TOKEN` y `VITE_SPLITR_TOKEN`) deben tener el mismo valor.

Para generar un token seguro:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Deploy

El proyecto se deploya automáticamente en Vercel con cada push a `feature/splitr`.

```bash
git push origin feature/splitr
```

### Variables en Vercel
Configurar en el dashboard de Vercel o via CLI:
```bash
vercel env add ANTHROPIC_API_KEY production
vercel env add SPLITR_TOKEN production
vercel env add VITE_SPLITR_TOKEN production
```

---

## Estructura del proyecto

```
splitr-boleta/
├── api/
│   └── analyze.js        # Serverless function: recibe imágenes, llama a Claude
├── src/
│   ├── App.jsx           # App principal (upload → selección → resumen)
│   ├── main.jsx
│   └── index.css
├── public/
├── index.html
├── .env.example
├── package.json
├── tailwind.config.js
└── vite.config.js
```

---

## Seguridad

- La `ANTHROPIC_API_KEY` nunca se expone al cliente — vive solo en el servidor
- El endpoint `/api/analyze` requiere un header `x-splitr-token` válido
- Límites: máx 5 imágenes por request, máx ~5MB por imagen
- Solo se aceptan imágenes (`image/jpeg`, `image/png`, `image/gif`, `image/webp`)

---
