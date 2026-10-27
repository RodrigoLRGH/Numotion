/// <reference types="astro/client" />

declare namespace App {
    interface Locals {
        usuario: import("./modules/shared/servidor/auth").UsuarioSesion | null;
    }
}

interface ImportMetaEnv {
    readonly EMOTION_PROVIDER?: "simulado" | "rekognition";
    readonly AWS_REGION?: string;
    readonly DATABASE_URL?: string;
}
