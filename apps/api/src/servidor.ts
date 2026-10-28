// Arranque local de la API. En Vercel se usa crearApp() desde api/index.ts.
import { crearApp } from "./app";

const puerto = Number(process.env.PORT ?? 3000);
crearApp().listen(puerto, () => console.log(`[api] escuchando en http://localhost:${puerto}`));
