// Lectura en voz alta para alumnos que aún no leen con fluidez (RNF-06, convenciones §8).
// Web Speech API: puede no existir (navegadores antiguos) y entonces no hace nada.

export function vozDisponible(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function hablar(texto: string): void {
    if (!vozDisponible()) return;
    const s = window.speechSynthesis;
    s.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-MX";
    u.rate = 0.9;
    const voz = s.getVoices().find((v) => v.lang === "es-MX") ?? s.getVoices().find((v) => v.lang.startsWith("es"));
    if (voz) u.voice = voz;
    s.speak(u);
}
