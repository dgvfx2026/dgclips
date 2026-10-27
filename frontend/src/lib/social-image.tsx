import { ImageResponse } from "next/og";
export async function createSocialImageResponse() {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#141614", color: "#ecf2e5", fontFamily: "sans-serif" }}>
    <div style={{ display: "flex", fontSize: 28, letterSpacing: 5, color: "#c3f85c", marginBottom: 55 }}>DGCLIPS / STUDIO</div>
    <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.15, letterSpacing: -3 }}>Boas ideias merecem</div>
    <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.15, letterSpacing: -3, color: "#c3f85c" }}>mais alcance.</div>
    <div style={{ display: "flex", fontSize: 25, color: "#a8b49b", marginTop: 45 }}>Menos edição. Mais criação.</div>
  </div>, { width: 1200, height: 630 });
}
