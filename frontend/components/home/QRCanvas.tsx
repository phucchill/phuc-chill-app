// "use client";
// import { useEffect, useRef } from "react";

// export default function QRCanvas({ value, size = 120 }: { value: string; size?: number }) {
//   const canvasRef = useRef<HTMLCanvasElement>(null);

//   useEffect(() => {
//     const canvas = canvasRef.current;
//     if (!canvas || !value) return;
//     const ctx = canvas.getContext("2d");
//     if (!ctx) return;

//     const cells = 21;
//     const cellSize = size / cells;
//     ctx.clearRect(0, 0, size, size);
//     ctx.fillStyle = "#0d0720";
//     ctx.fillRect(0, 0, size, size);

//     let seed = 0;
//     for (let i = 0; i < value.length; i++) {
//       seed = ((seed << 5) - seed + value.charCodeAt(i)) | 0;
//     }
//     const rand = (n: number) => {
//       seed = (seed * 1664525 + 1013904223) | 0;
//       return ((seed >>> 0) % n);
//     };

//     for (let r = 0; r < cells; r++) {
//       for (let c = 0; c < cells; c++) {
//         const inTopLeft = r < 8 && c < 8;
//         const inTopRight = r < 8 && c > cells - 9;
//         const inBottomLeft = r > cells - 9 && c < 8;
//         let filled = false;

//         if (inTopLeft || inTopRight || inBottomLeft) {
//           const isTLFilled = inTopLeft && ((r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6)) || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
//           const isTRFilled = inTopRight && ((r >= 0 && r <= 6 && (c === cells - 1 || c === cells - 7)) || (c >= cells - 7 && c <= cells - 1 && (r === 0 || r === 6)) || (r >= 2 && r <= 4 && c >= cells - 5 && c <= cells - 3));
//           const isBLFilled = inBottomLeft && ((r >= cells - 7 && r <= cells - 1 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === cells - 1 || r === cells - 7)) || (r >= cells - 5 && r <= cells - 3 && c >= 2 && c <= 4));
//           filled = isTLFilled || isTRFilled || isBLFilled;
//         } else {
//           filled = rand(2) === 1;
//         }

//         if (filled) {
//           const gradient = ctx.createLinearGradient(c * cellSize, r * cellSize, (c + 1) * cellSize, (r + 1) * cellSize);
//           gradient.addColorStop(0, "#a78bfa");
//           gradient.addColorStop(1, "#f472b6");
//           ctx.fillStyle = gradient;
//           ctx.fillRect(c * cellSize + 0.5, r * cellSize + 0.5, cellSize - 1, cellSize - 1);
//         }
//       }
//     }
//   }, [value, size]);

//   return <canvas ref={canvasRef} width={size} height={size} style={{ borderRadius: 8, display: "block" }} />;
// }