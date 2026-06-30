// "use client";
// import QRCanvas from "./QRCanvas";

// export default function QRJoin({ roomId, onChange, getRoomUrl }: {
//   roomId: string;
//   onChange: (v: string) => void;
//   getRoomUrl: (id: string) => string;
// }) {
//   return (
//     <div>
//       <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
//         Nhập mã để xem QR chia sẻ
//       </label>
//       <input
//         type="text"
//         placeholder="Nhập mã phòng..."
//         value={roomId}
//         onChange={(e) => onChange(e.target.value.toUpperCase())}
//         style={{
//           width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
//           borderRadius: 14, padding: "11px 14px", color: "white", fontSize: 16,
//           fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, letterSpacing: "0.1em",
//           outline: "none", boxSizing: "border-box", marginBottom: 16, textTransform: "uppercase", transition: "border-color 0.2s",
//         }}
//         onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(167,139,250,0.4)")}
//         onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
//       />

//       {roomId ? (
//         <div style={{ display: "flex", gap: 20, alignItems: "center", background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
//           <div style={{ padding: 8, background: "#0d0720", borderRadius: 12, border: "1px solid rgba(167,139,250,0.2)", flexShrink: 0 }}>
//             <QRCanvas value={getRoomUrl(roomId)} size={100} />
//           </div>
//           <div>
//             <p style={{ margin: "0 0 6px", fontSize: 16, fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, color: "white", letterSpacing: "0.08em" }}>{roomId}</p>
//             <p style={{ margin: "0 0 12px", fontSize: 11, color: "rgba(255,255,255,0.3)", wordBreak: "break-all", lineHeight: 1.5 }}>{getRoomUrl(roomId)}</p>
//             <button
//               onClick={() => navigator.clipboard.writeText(getRoomUrl(roomId))}
//               style={{ fontSize: 11, padding: "5px 12px", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 20, color: "#a78bfa", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
//             >
//               Sao chép link
//             </button>
//           </div>
//         </div>
//       ) : (
//         <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 100, color: "rgba(255,255,255,0.15)", fontSize: 13, fontStyle: "italic" }}>
//           QR sẽ hiện ở đây...
//         </div>
//       )}
//     </div>
//   );
// }