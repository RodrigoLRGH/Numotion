// Función de Vercel: la API Express completa. Usa el bundle de apps/api (npm run build),
// que ya incluye @numotion/core; las dependencias de node_modules las rastrea Vercel.
import { crearApp } from "../apps/api/dist/app.js";

export default crearApp();
