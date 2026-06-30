// "use client";

// export default function LinkJoin({ value, onChange, onEnter }: {
//   value: string;
//   onChange: (v: string) => void;
//   onEnter: () => void;
// }) {
//   return (
//     <div>
//       <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
//         Dán link phòng
//       </label>
//       <div style={{ position: "relative" }}>
//         <input
//           type="url"
//           placeholder="https://musicroom.app/room/PARTY-2024"
//           value={value}
//           onChange={(e) => onChange(e.target.value)}
//           onKeyDown={(e) => e.key === "Enter" && onEnter()}
//           style={{
//             width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
//             borderRadius: 14, padding: "13px 46px 13px 14px", color: "rgba(167,139,250,0.9)",
//             fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none",
//             boxSizing: "border-box", transition: "border-color 0.2s",
//           }}
//           onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(167,139,250,0.4)")}
//           onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
//         />
//         <button
//           onClick={async () => { const text = await navigator.clipboard.readText(); onChange(text); }}
//           title="Dán từ clipboard"
//           style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", display: "flex", padding: 4 }}
//         >
//           <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
//             <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
//             <rect x="8" y="2" width="8" height="4" rx="1" stroke="currentColor" strokeWidth="2"/>
//           </svg>
//         </button>
//       </div>
//       <p style={{ margin: "8px 0 0", fontSize: 11, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>
//         Dán link bạn bè chia sẻ vào đây
//       </p>
//     </div>
//   );
// }