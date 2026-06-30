// "use client";

// type JoinMethod = "code" | "link" | "qr";

// const tabs: { id: JoinMethod; label: string; icon: string }[] = [
//   { id: "code", label: "Mã phòng", icon: "🎵" },
//   { id: "link", label: "Đường link", icon: "🔗" },
//   { id: "qr", label: "Mã QR", icon: "📷" },
// ];

// export default function JoinTabs({ method, onChange }: { method: JoinMethod; onChange: (m: JoinMethod) => void }) {
//   return (
//     <div style={{ marginBottom: 20 }}>
//       <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
//         Cách tham gia
//       </label>
//       <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: 4, border: "1px solid rgba(255,255,255,0.05)" }}>
//         {tabs.map((tab) => (
//           <button
//             key={tab.id}
//             onClick={() => onChange(tab.id)}
//             style={{
//               padding: "10px 6px", borderRadius: 10, border: "none", cursor: "pointer",
//               background: method === tab.id ? "linear-gradient(135deg, rgba(124,58,237,0.5), rgba(236,72,153,0.3))" : "transparent",
//               color: method === tab.id ? "white" : "rgba(255,255,255,0.4)",
//               fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: method === tab.id ? 500 : 400,
//               transition: "all 0.2s ease", display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
//               boxShadow: method === tab.id ? "0 2px 12px rgba(124,58,237,0.3)" : "none", outline: "none",
//             }}
//           >
//             <span style={{ fontSize: 18 }}>{tab.icon}</span>
//             <span>{tab.label}</span>
//           </button>
//         ))}
//       </div>
//     </div>
//   );
// }