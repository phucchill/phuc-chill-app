// "use client";

// export default function CodeJoin({ roomId, onChange, onEnter }: {
//   roomId: string;
//   onChange: (v: string) => void;
//   onEnter: () => void;
// }) {
//   return (
//     <div>
//       <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
//         Mã phòng
//       </label>
//       <input
//         type="text"
//         placeholder="Ví dụ: PARTY-2024"
//         value={roomId}
//         onChange={(e) => onChange(e.target.value.toUpperCase())}
//         onKeyDown={(e) => e.key === "Enter" && onEnter()}
//         style={{
//           width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
//           borderRadius: 14, padding: "13px 14px", color: "white", fontSize: 18,
//           fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, letterSpacing: "0.12em",
//           outline: "none", boxSizing: "border-box", transition: "border-color 0.2s", textTransform: "uppercase",
//         }}
//         onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(167,139,250,0.4)")}
//         onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
//       />
//     </div>
//   );
// }