"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSocket } from "@/lib/socket";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useAudio } from "@/hooks/useAudio";
import type { RoomState, WSMessage } from "@/types/websocket";

/* ─── types ──────────────────────────────────────────────────────────────────── */
type Role = "host" | "mic" | "viewer";
interface SongItem   { id:string;title:string;artist:string;songUrl:string;requestedBy:string;requestedByName:string; }
interface MicReq     { userId:string;userName:string;requestedAt:number; }
interface GiftEvt    { id:string;fromUserId:string;fromUserName:string;toUserId:string;toUserName:string;giftEmoji:string;giftName:string;giftCost:number;addedToPK:boolean;giftScore:number;timestamp:number; }
interface PKState    { challengerId:string;challengerName:string;opponentId:string;opponentName:string;challengerScore:number;opponentScore:number;endsAt:number;votedUsers:string[]; }
interface PKResult   { winnerId:string;winnerName:string;challengerName:string;challengerScore:number;opponentName:string;opponentScore:number; }

const GIFTS = [
  {type:"rose",   emoji:"🌹",name:"Hoa hồng",  cost:10 },
  {type:"heart",  emoji:"💖",name:"Trái tim",  cost:20 },
  {type:"crown",  emoji:"👑",name:"Vương miện",cost:50 },
  {type:"diamond",emoji:"💎",name:"Kim cương", cost:100},
  {type:"rocket", emoji:"🚀",name:"Tên lửa",   cost:200},
  {type:"trophy", emoji:"🏆",name:"Cúp vàng",  cost:500},
];

/* ─── design tokens ──────────────────────────────────────────────────────────── */
const C = {
  bg:       "#060410",
  surface:  "#0e0b1a",
  surfaceHi:"#14102a",
  border:   "rgba(139,92,246,.18)",
  borderLo: "rgba(255,255,255,.07)",
  purple:   "#8b5cf6",
  purpleLo: "rgba(139,92,246,.15)",
  pink:     "#ec4899",
  pinkLo:   "rgba(236,72,153,.12)",
  gold:     "#f59e0b",
  goldLo:   "rgba(245,158,11,.12)",
  text:     "rgba(255,255,255,.92)",
  textMid:  "rgba(255,255,255,.5)",
  textLow:  "rgba(255,255,255,.28)",
  green:    "#10b981",
  red:      "#ef4444",
};

const glass = (alpha=.06):React.CSSProperties => ({
  background:`rgba(255,255,255,${alpha})`,
  backdropFilter:"blur(20px)",
  WebkitBackdropFilter:"blur(20px)",
});

/* ═══ AVATAR ═════════════════════════════════════════════════════════════════ */
function Av({id,name,sz=40,glow=false,pulse=false}:{id:string;name:string;sz?:number;glow?:boolean;pulse?:boolean}) {
  const h1=(id.charCodeAt(0)*53)%360, h2=(id.charCodeAt(1||0)*97)%360;
  return (
    <div style={{
      width:sz,height:sz,borderRadius:"50%",flexShrink:0,
      background:`linear-gradient(145deg,hsl(${h1},65%,42%),hsl(${h2},70%,56%))`,
      display:"flex",alignItems:"center",justifyContent:"center",
      fontSize:sz*.38,fontWeight:700,color:"#fff",
      boxShadow: glow
        ? `0 0 0 2px ${C.bg},0 0 0 3.5px ${pulse?"#8b5cf6":"rgba(139,92,246,.45)"},${pulse?"0 0 20px rgba(139,92,246,.5)":""}`
        : "none",
      transition:"box-shadow .3s",
      position:"relative",
    }}>
      {name[0]?.toUpperCase()||"?"}
      {pulse && (
        <span style={{
          position:"absolute",inset:-4,borderRadius:"50%",
          border:"2px solid rgba(139,92,246,.6)",
          animation:"ring 1.8s ease-out infinite",
        }}/>
      )}
    </div>
  );
}

/* ═══ MIC GRID ═══════════════════════════════════════════════════════════════ */
function MicGrid({participants,micUid,micReqs,isHost,myId,myRole,onReq,onApprove,onReject,onRelease}:{
  participants:{id:string;name:string;isHost:boolean}[];
  micUid:string;micReqs:MicReq[];isHost:boolean;myId:string;myRole:Role;
  onReq:()=>void;onApprove:(u:string,n:string)=>void;onReject:(u:string)=>void;onRelease:()=>void;
}) {
  const host   = participants.find(p=>p.isHost);
  const holder = micUid ? participants.find(p=>p.id===micUid&&!p.isHost) : null;

  type Slot =
    |{k:"host";   user:{id:string;name:string}}
    |{k:"mic";    user:{id:string;name:string}}
    |{k:"pending";req:MicReq}
    |{k:"empty";  i:number};

  const slots:Slot[] = [
    host   ?{k:"host",  user:host}   :{k:"empty",i:0},
    holder ?{k:"mic",   user:holder} :{k:"empty",i:1},
    ...micReqs.slice(0,4).map(r=>({k:"pending" as const,req:r})),
  ];
  while(slots.length<6) slots.push({k:"empty",i:slots.length});

  const canReq = myRole==="viewer"; // allow queuing even if someone is on mic

  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,padding:"0 16px 16px"}}>
      {slots.map((s,i)=>{
        const isOccupied = s.k==="host"||s.k==="mic";
        const isPending  = s.k==="pending";
        const borderCol  = s.k==="host"  ? C.gold
                         : s.k==="mic"   ? C.purple
                         : s.k==="pending"? C.pink
                         : C.borderLo;
        const bgCol = isOccupied||isPending
          ? `linear-gradient(145deg,rgba(139,92,246,.08),rgba(236,72,153,.05))`
          : "rgba(255,255,255,.02)";

        return (
          <div key={i}
            onClick={()=>s.k==="empty"&&i>0&&canReq&&onReq()}
            style={{
              border:`1px solid ${borderCol}`,borderRadius:16,
              background:bgCol,aspectRatio:"1",
              display:"flex",flexDirection:"column",alignItems:"center",
              justifyContent:"center",gap:6,position:"relative",overflow:"hidden",
              cursor:s.k==="empty"&&i>0&&canReq?"pointer":"default",
              transition:"all .2s",
            }}
            onMouseEnter={e=>{if(s.k==="empty"&&i>0&&canReq)(e.currentTarget as HTMLElement).style.background="rgba(139,92,246,.08)";}}
            onMouseLeave={e=>{if(s.k==="empty"&&i>0)(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,.02)";}}
          >
            {/* subtle shimmer top-left */}
            {isOccupied && (
              <div style={{position:"absolute",top:-20,left:-20,width:60,height:60,borderRadius:"50%",
                background: s.k==="host"?"rgba(245,158,11,.08)":"rgba(139,92,246,.1)",
                filter:"blur(16px)",pointerEvents:"none"}}/>
            )}

            {/* badge */}
            {(s.k==="host"||s.k==="mic") && (
              <span style={{
                position:"absolute",top:7,left:8,padding:"2px 7px",
                borderRadius:20,fontSize:9,letterSpacing:".07em",textTransform:"uppercase",fontWeight:600,
                background: s.k==="host"?C.goldLo:C.purpleLo,
                color:      s.k==="host"?C.gold  :C.purple,
                border:`1px solid ${s.k==="host"?"rgba(245,158,11,.3)":"rgba(139,92,246,.35)"}`,
              }}>
                {s.k==="host"?"Chủ phòng":"🎤 Mic"}
              </span>
            )}

            {s.k==="host" && (
              <>
                <Av id={s.user.id} name={s.user.name} sz={46} glow/>
                <span style={{fontSize:11,color:C.text,maxWidth:"85%",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:500}}>
                  {s.user.name}
                </span>
              </>
            )}

            {s.k==="mic" && (
              <>
                <Av id={s.user.id} name={s.user.name} sz={46} glow pulse/>
                <span style={{fontSize:11,color:C.text,maxWidth:"85%",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:500}}>
                  {s.user.name}
                </span>
                {(s.user.id===myId||isHost)&&(
                  <button onClick={e=>{e.stopPropagation();onRelease();}} style={{
                    padding:"3px 10px",borderRadius:6,border:"none",cursor:"pointer",
                    background:"rgba(239,68,68,.15)",color:"#fca5a5",fontSize:10,fontWeight:500,
                  }}>Tắt mic</button>
                )}
              </>
            )}

            {s.k==="pending" && (
              <>
                <Av id={s.req.userId} name={s.req.userName} sz={40}/>
                <span style={{fontSize:11,color:C.textMid,maxWidth:"85%",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {s.req.userName}
                </span>
                {isHost && (
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={e=>{e.stopPropagation();onApprove(s.req.userId,s.req.userName);}} style={{
                      padding:"3px 9px",borderRadius:6,border:"none",cursor:"pointer",
                      background:"rgba(16,185,129,.15)",color:"#6ee7b7",fontSize:10,fontWeight:500,
                    }}>✓ Duyệt</button>
                    <button onClick={e=>{e.stopPropagation();onReject(s.req.userId);}} style={{
                      padding:"3px 8px",borderRadius:6,border:"none",cursor:"pointer",
                      background:"rgba(239,68,68,.12)",color:"#fca5a5",fontSize:10,
                    }}>✗</button>
                  </div>
                )}
              </>
            )}

            {s.k==="empty" && (
              <>
                <div style={{
                  width:38,height:38,borderRadius:"50%",
                  border:`1.5px dashed ${i>0&&canReq?"rgba(139,92,246,.35)":"rgba(255,255,255,.1)"}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  color:i>0&&canReq?"rgba(139,92,246,.5)":"rgba(255,255,255,.15)",fontSize:20,
                  transition:"all .2s",
                }}>+</div>
                {i>0&&canReq&&(
                  <span style={{fontSize:10,color:"rgba(139,92,246,.5)",fontWeight:500}}>Xin mic</span>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══ PK BAR ════════════════════════════════════════════════════════════════ */
function PKBar({pk,myId,onVote}:{pk:PKState;myId:string;onVote:(s:"challenger"|"opponent")=>void}) {
  const [left,setLeft]=useState(Math.max(0,Math.ceil((pk.endsAt-Date.now())/1000)));
  useEffect(()=>{const t=setInterval(()=>setLeft(Math.max(0,Math.ceil((pk.endsAt-Date.now())/1000))),500);return()=>clearInterval(t);},[pk.endsAt]);
  const total=Math.max(pk.challengerScore+pk.opponentScore,1);
  const cPct=(pk.challengerScore/total)*100;
  const voted=pk.votedUsers.includes(myId);
  const isPlayer=myId===pk.challengerId||myId===pk.opponentId;
  const urgent=left<=10;

  return (
    <div style={{
      borderRadius:16,overflow:"hidden",
      border:"1px solid rgba(239,68,68,.25)",
      background:"linear-gradient(135deg,rgba(139,92,246,.06),rgba(236,72,153,.04))",
      boxShadow:"0 4px 24px rgba(139,92,246,.1)",
    }}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 18px 8px"}}>
        <span style={{fontSize:11,letterSpacing:".12em",color:C.gold,textTransform:"uppercase",fontWeight:700}}>
          ⚔️ PK Battle
        </span>
        <div style={{
          padding:"3px 10px",borderRadius:20,
          background:urgent?"rgba(239,68,68,.15)":"rgba(255,255,255,.07)",
          border:`1px solid ${urgent?"rgba(239,68,68,.35)":"rgba(255,255,255,.12)"}`,
          fontSize:12,fontWeight:700,color:urgent?C.red:C.textMid,
          fontVariantNumeric:"tabular-nums",transition:"all .3s",
        }}>{left}s</div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 24px 1fr",alignItems:"center",padding:"0 18px 10px",gap:8}}>
        <div>
          <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:4}}>{pk.challengerName}</div>
          <div style={{fontSize:26,fontWeight:800,color:"#a78bfa",fontVariantNumeric:"tabular-nums",lineHeight:1}}>
            {pk.challengerScore}
          </div>
        </div>
        <div style={{textAlign:"center",fontSize:11,color:C.textLow,fontWeight:600}}>vs</div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:4}}>{pk.opponentName}</div>
          <div style={{fontSize:26,fontWeight:800,color:"#f9a8d4",fontVariantNumeric:"tabular-nums",lineHeight:1}}>
            {pk.opponentScore}
          </div>
        </div>
      </div>

      {/* split bar */}
      <div style={{height:5,margin:"0 18px 12px",borderRadius:3,background:"rgba(255,255,255,.07)",overflow:"hidden"}}>
        <div style={{
          height:"100%",borderRadius:3,
          background:`linear-gradient(90deg,#8b5cf6 ${cPct}%,#ec4899 ${cPct}%)`,
          transition:"background .55s ease",
        }}/>
      </div>

      {!isPlayer&&!voted&&(
        <div style={{display:"flex",gap:8,padding:"0 18px 14px"}}>
          <button onClick={()=>onVote("challenger")} style={{
            flex:1,padding:"8px 0",borderRadius:10,cursor:"pointer",fontWeight:600,
            border:"1px solid rgba(139,92,246,.4)",background:C.purpleLo,
            color:"#a78bfa",fontSize:12,transition:"all .15s",
          }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="rgba(139,92,246,.22)"}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=C.purpleLo}
          >👍 {pk.challengerName}</button>
          <button onClick={()=>onVote("opponent")} style={{
            flex:1,padding:"8px 0",borderRadius:10,cursor:"pointer",fontWeight:600,
            border:"1px solid rgba(236,72,153,.4)",background:C.pinkLo,
            color:"#f9a8d4",fontSize:12,transition:"all .15s",
          }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="rgba(236,72,153,.22)"}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=C.pinkLo}
          >👍 {pk.opponentName}</button>
        </div>
      )}
      {(voted||isPlayer)&&(
        <div style={{textAlign:"center",padding:"0 18px 12px",fontSize:11,color:C.textLow}}>
          {isPlayer?"Bạn đang thi đấu":"Đã vote ✓"}
        </div>
      )}
    </div>
  );
}

/* ═══ WINNER OVERLAY ════════════════════════════════════════════════════════ */
function WinnerOverlay({result,onDone}:{result:PKResult;onDone:()=>void}) {
  useEffect(()=>{const t=setTimeout(onDone,7000);return()=>clearTimeout(t);},[onDone]);
  return (
    <div style={{position:"fixed",inset:0,zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center",
      background:"rgba(4,2,14,.8)",backdropFilter:"blur(16px)",animation:"fdIn .4s ease"}}>
      <div style={{textAlign:"center",animation:"winPop .5s cubic-bezier(.34,1.56,.64,1) both"}}>
        <div style={{fontSize:76,marginBottom:8}}>🏆</div>
        <div style={{fontFamily:"Georgia,serif",fontSize:52,fontWeight:700,lineHeight:1.1,
          background:"linear-gradient(135deg,#f59e0b,#fcd34d)",
          WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
          textShadow:"none",marginBottom:10,filter:"drop-shadow(0 0 40px rgba(245,158,11,.4))"}}>
          {result.winnerName}
        </div>
        <div style={{fontSize:14,color:C.textMid,marginBottom:28,letterSpacing:".05em"}}>chiến thắng!</div>
        <div style={{display:"flex",gap:32,justifyContent:"center",fontSize:13,color:C.textLow}}>
          <span>{result.challengerName}: <strong style={{color:"#a78bfa"}}>{result.challengerScore}</strong></span>
          <span style={{color:"rgba(255,255,255,.15)"}}>·</span>
          <span>{result.opponentName}: <strong style={{color:"#f9a8d4"}}>{result.opponentScore}</strong></span>
        </div>
      </div>
    </div>
  );
}

/* ═══ GIFT TOAST ════════════════════════════════════════════════════════════ */
function GiftToast({g,onDone}:{g:GiftEvt;onDone:()=>void}) {
  useEffect(()=>{const t=setTimeout(onDone,3400);return()=>clearTimeout(t);},[onDone]);
  return (
    <div style={{position:"fixed",bottom:100,right:28,zIndex:9500,animation:"gUp 3.4s ease-out forwards",pointerEvents:"none"}}>
      <div style={{
        display:"flex",alignItems:"center",gap:12,padding:"12px 18px",borderRadius:16,
        background:"linear-gradient(135deg,rgba(139,92,246,.92),rgba(236,72,153,.86))",
        border:"1px solid rgba(255,255,255,.18)",
        boxShadow:"0 8px 32px rgba(139,92,246,.4),0 2px 8px rgba(0,0,0,.3)",
      }}>
        <span style={{fontSize:32}}>{g.giftEmoji}</span>
        <div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.6)",marginBottom:2}}>{g.fromUserName} → {g.toUserName}</div>
          <div style={{fontSize:14,fontWeight:700,color:"white"}}>
            {g.giftName}
            {g.addedToPK&&<span style={{marginLeft:6,fontSize:11,color:"#fcd34d"}}>+{g.giftScore} ⚔️</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ PROGRESS BAR ══════════════════════════════════════════════════════════ */
function ProgressBar({audioRef,isHost,onSeek}:{audioRef:React.RefObject<HTMLAudioElement|null>;isHost:boolean;onSeek:()=>void}) {
  const barRef=useRef<HTMLDivElement>(null);
  const [prog,setProg]=useState(0);
  const [dur,setDur]=useState(0);
  useEffect(()=>{
    const a=audioRef.current;if(!a)return;
    const t=()=>setProg(a.currentTime);
    const d=()=>setDur(a.duration||0);
    a.addEventListener("timeupdate",t);a.addEventListener("loadedmetadata",d);
    return()=>{a.removeEventListener("timeupdate",t);a.removeEventListener("loadedmetadata",d);};
  },[audioRef]);
  const fmt=(s:number)=>!s||isNaN(s)?"0:00":`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
  const pct=dur>0?(prog/dur)*100:0;
  const seek=(e:React.MouseEvent<HTMLDivElement>)=>{
    if(!isHost||!barRef.current||!audioRef.current||!dur)return;
    const r=barRef.current.getBoundingClientRect();
    audioRef.current.currentTime=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*dur;
    onSeek();
  };
  return (
    <div>
      <div ref={barRef} onClick={seek}
        style={{height:3,background:"rgba(255,255,255,.08)",borderRadius:2,cursor:isHost?"pointer":"default",position:"relative",overflow:"visible"}}>
        <div style={{height:"100%",width:`${pct}%`,borderRadius:2,
          background:"linear-gradient(90deg,#8b5cf6,#ec4899)",
          transition:"width .15s linear",position:"relative"}}>
          <div style={{
            position:"absolute",right:-5,top:"50%",transform:"translateY(-50%)",
            width:10,height:10,borderRadius:"50%",background:"white",
            boxShadow:"0 0 8px rgba(139,92,246,.7)",opacity:isHost?1:0,
            transition:"opacity .2s",
          }}/>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:5,
        fontSize:10,color:C.textLow,fontVariantNumeric:"tabular-nums"}}>
        <span>{fmt(prog)}</span><span>{fmt(dur)}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════════════════════════════════ */
export default function KTVPage() {
  const {roomId}=useParams<{roomId:string}>();
  const router=useRouter();
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const socketRef=useRef<WebSocket|null>(null);
  const userIdRef=useRef(""),userNameRef=useRef("");
  const chatEndRef=useRef<HTMLDivElement|null>(null);
  const msgRef=useRef<(d:WSMessage)=>void>(null!);

  const [userId,setUserId]=useState("");
  const [roomState,setRS]=useState<RoomState|null>(null);
  const [connected,setConn]=useState(false);
  const [waiting,setWaiting]=useState(false);
  const [joinReqs,setJoinReqs]=useState<{userId:string;userName:string}[]>([]);
  const [myRole,setMyRole]=useState<Role>("viewer");

  const [queue,setQueue]=useState<SongItem[]>([]);
  const [micReqs,setMicReqs]=useState<MicReq[]>([]);
  const [micUid,setMicUid]=useState("");
  const [pkState,setPK]=useState<PKState|null>(null);
  const [pkResult,setPKRes]=useState<PKResult|null>(null);
  const [gifts,setGifts]=useState<GiftEvt[]>([]);

  const [chatText,setChatText]=useState("");
  const [showQueue,setShowQueue]=useState(false);
  const [showGift,setShowGift]=useState(false);
  const [showPKMenu,setShowPKMenu]=useState(false);
  const [giftTarget,setGiftTarget]=useState("");
  const [songForm,setSongForm]=useState({title:"",artist:"",url:""});

  const {needsInteraction,syncPlay,syncPause,syncSeek,handleInteract}=useAudio(audioRef);
  const {messages,isLoading,appendMessage}=useChatHistory({
    roomId,currentUserId:userId,
    apiBase:process.env.NEXT_PUBLIC_API_URL??"http://localhost:8080",
  });

  const isHost=roomState?.hostId===userId;
  const participants=roomState?.participants??[];

  const sendWS=useCallback((type:string,payload:unknown)=>{
    if(socketRef.current?.readyState!==WebSocket.OPEN)return;
    socketRef.current.send(JSON.stringify({type,roomId,payload}));
  },[roomId]);

  /* message handler — ref pattern */
  useEffect(()=>{
    msgRef.current=(data:WSMessage)=>{
      const p=typeof data.payload==="string"?JSON.parse(data.payload):data.payload;
      switch(data.type){
        case "WAITING_APPROVAL":setWaiting(true);break;
        case "JOIN_APPROVED":setWaiting(false);break;
        case "JOIN_REJECTED":
          localStorage.setItem("room_notification","Bạn đã bị từ chối");
          socketRef.current?.close();router.push("/rooms");break;
        case "ROOM_FULL":alert(p.message||"Phòng đầy");socketRef.current?.close();break;
        case "JOIN_REQUEST":
          setJoinReqs(prev=>prev.some(r=>r.userId===p.userId)?prev:[...prev,{userId:p.userId,userName:p.userName||"Khách"}]);break;
        case "ROOM_STATE":{
          setWaiting(false);setRS(p as RoomState);
          if(p.isPlaying)setTimeout(()=>void syncPlay(p.currentSong||"/music/sao-hang-a.mp3",p.progress||0),300);
          else syncPause(p.progress||0);
          setMicUid(p.activeMicUid || "");
          setMicReqs(p.micRequests || []);
          break;
        }
        case "SYNC_PLAY":
          void syncPlay(p.songId||"/music/sao-hang-a.mp3",p.progress||0);
          setRS(prev=>prev?{...prev,currentSong:p.songId||prev.currentSong,isPlaying:true}:prev);break;
        case "SYNC_PAUSE":syncPause(p.progress||0);setRS(prev=>prev?{...prev,isPlaying:false}:prev);break;
        case "SYNC_SEEK":syncSeek(p.progress||0);break;
        case "SYNC_PROGRESS":setRS(prev=>prev?{...prev,currentSong:p.songId||prev.currentSong,isPlaying:p.isPlaying,progress:p.progress||0}:prev);break;
        case "CHAT":{
          const sid=data.senderId??p.senderId??"";
          appendMessage({id:p.id??p._id,roomId,senderId:sid,userName:p.userName||"Ẩn danh",
            content:p.content||"",timestamp:data.timestamp??p.timestamp??Date.now(),
            createdAt:p.createdAt,isMine:sid===userIdRef.current});break;
        }
        case "SONG_QUEUE_UPDATE":setQueue(p.queue||[]);break;
        case "MIC_REQUEST":
          setMicReqs(prev=>prev.some(r=>r.userId===p.userId)?prev:[...prev,{userId:p.userId,userName:p.userName,requestedAt:p.requestedAt||Date.now()}]);break;
        case "MIC_APPROVE":
          setMicUid(p.userId);setMicReqs(prev=>prev.filter(r=>r.userId!==p.userId));
          if(p.userId===userIdRef.current)setMyRole("mic");break;
        case "MIC_REJECT":setMicReqs(prev=>prev.filter(r=>r.userId!==p.userId));break;
        case "MIC_RELEASE":setMicUid("");if(p.prevUserId===userIdRef.current)setMyRole("viewer");break;
        case "ROLE_UPDATE":if(p.userId===userIdRef.current)setMyRole(p.role as Role);break;
        case "GIFT_BROADCAST":
          setGifts(prev=>[...prev,{...p,id:p.id||String(p.timestamp),timestamp:p.timestamp||Date.now()}]);break;
        case "PK_CHALLENGE":
          setPK({challengerId:p.challengerId,challengerName:p.challengerName,opponentId:p.opponentId,opponentName:p.opponentName,
            challengerScore:0,opponentScore:0,endsAt:p.endsAt||Date.now()+60000,votedUsers:[]});break;
        case "PK_VOTE":
        case "PK_SCORE_UPDATE":
          setPK(prev=>prev?{...prev,challengerScore:p.challengerScore??prev.challengerScore,opponentScore:p.opponentScore??prev.opponentScore}:prev);break;
        case "PK_RESULT":
          setPKRes({winnerId:p.winnerId,winnerName:p.winnerName,challengerName:p.challengerName,
            challengerScore:p.challengerScore,opponentName:p.opponentName,opponentScore:p.opponentScore});
          setPK(null);break;
        case "ERROR":alert(p.message||"Lỗi");break;
      }
    };
  });

  useEffect(()=>{
    let id=localStorage.getItem("userId");
    const name=localStorage.getItem("userName")||"Khách";
    if(!id){id=crypto.randomUUID();localStorage.setItem("userId",id);}
    userIdRef.current=id;userNameRef.current=name;setUserId(id);
    const ws=createSocket({roomId,userId:id,userName:name,roomType:"ktv"});
    socketRef.current=ws;
    ws.onopen=()=>setConn(true);ws.onclose=()=>setConn(false);ws.onerror=()=>setConn(false);
    ws.onmessage=(ev:MessageEvent)=>{
      for(const line of (ev.data as string).split("\n").map((l:string)=>l.trim()).filter(Boolean)){
        try{msgRef.current(JSON.parse(line));}catch{}
      }
    };
    return()=>ws.close();
  },[roomId]);

  useEffect(()=>{chatEndRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);
  useEffect(()=>{if(isHost)setMyRole("host");},[isHost]);

  const handlePlay=async()=>{
    const a=audioRef.current;if(!a)return;
    const src=roomState?.currentSong||"/music/sao-hang-a.mp3";
    try{const cp=new URL(a.src).pathname;if(cp!==src&&!cp.endsWith(src)){a.src=src;a.load();}}
    catch{a.src=src;a.load();}
    try{await a.play();sendWS("SYNC_PLAY",{songId:src,progress:a.currentTime,isPlaying:true});setRS(prev=>prev?{...prev,isPlaying:true}:prev);}
    catch{alert("Không phát được nhạc.");}
  };
  const handlePause=()=>{
    const a=audioRef.current;if(!a)return;
    a.pause();sendWS("SYNC_PAUSE",{songId:roomState?.currentSong,progress:a.currentTime,isPlaying:false});
    setRS(prev=>prev?{...prev,isPlaying:false}:prev);
  };
  const handleSeek=()=>{const a=audioRef.current;if(!a)return;sendWS("SYNC_SEEK",{songId:roomState?.currentSong,progress:a.currentTime});};

  const sendChat=(txt?:string)=>{
    const t=txt??chatText;if(!t.trim())return;
    sendWS("CHAT",{userName:userNameRef.current,content:t,senderId:userIdRef.current});
    if(!txt)setChatText("");
  };
  const requestMic=()=>sendWS("MIC_REQUEST",{userId:userIdRef.current,userName:userNameRef.current});
  const approveMic=(u:string,n:string)=>{sendWS("MIC_APPROVE",{userId:u,userName:n});setMicReqs(p=>p.filter(r=>r.userId!==u));};
  const rejectMic=(u:string)=>{sendWS("MIC_REJECT",{userId:u});setMicReqs(p=>p.filter(r=>r.userId!==u));};
  const releaseMic=()=>sendWS("MIC_RELEASE",{userId:userIdRef.current});
  const approveJoin=(u:string)=>{sendWS("JOIN_APPROVE",{userId:u});setJoinReqs(p=>p.filter(r=>r.userId!==u));};
  const rejectJoin=(u:string)=>{sendWS("JOIN_REJECT",{userId:u});setJoinReqs(p=>p.filter(r=>r.userId!==u));};
  const votePK=(side:"challenger"|"opponent")=>sendWS("PK_VOTE",{voterId:userId,side});
  const challengePK=(oppId:string)=>{
    const opp=participants.find(p=>p.id===oppId);if(!opp)return;
    sendWS("PK_CHALLENGE",{challengerId:userId,challengerName:userNameRef.current,opponentId:oppId,opponentName:opp.name,endsAt:Date.now()+60000});
    setShowPKMenu(false);
  };
  const sendGift=(toId:string,toName:string,g:typeof GIFTS[0])=>{
    sendWS("GIFT_SEND",{fromUserId:userIdRef.current,fromUserName:userNameRef.current,
      toUserId:toId,toUserName:toName,giftType:g.type,giftEmoji:g.emoji,giftName:g.name,giftCost:g.cost,quantity:1});
    setShowGift(false);setGiftTarget("");
  };
  const addSong=()=>{
    if(!songForm.title.trim())return;
    sendWS("SONG_QUEUE_ADD",{id:crypto.randomUUID(),title:songForm.title,artist:songForm.artist||"Unknown",
      url:songForm.url||"/music/sao-hang-a.mp3",requestedBy:userIdRef.current,requestedByName:userNameRef.current});
    setSongForm({title:"",artist:"",url:""});
  };

  const songName=(roomState?.currentSong||"").split("/").pop()?.replace(".mp3","").replace(/-/g," ")||"Chưa có bài";

  /* ── waiting ── */
  if(waiting) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",
      flexDirection:"column",gap:16,color:C.text,fontFamily:"Inter,sans-serif"}}>
      <div style={{width:48,height:48,borderRadius:"50%",
        border:`3px solid ${C.purpleLo}`,borderTopColor:C.purple,animation:"spin 1s linear infinite"}}/>
      <div style={{fontSize:20,fontWeight:600,letterSpacing:".02em"}}>Đang chờ host duyệt</div>
      <div style={{fontSize:13,color:C.textMid}}>Host cần chấp nhận bạn vào phòng</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── main ── */
  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",
      background:C.bg,color:C.text,fontFamily:"Inter,-apple-system,sans-serif",overflow:"hidden"}}>

      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"/>

      {/* layered bg */}
      <div style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none"}}>
        <div style={{position:"absolute",inset:0,background:
          "radial-gradient(ellipse 65% 55% at 25% 10%,rgba(139,92,246,.13) 0%,transparent 60%),"+
          "radial-gradient(ellipse 50% 45% at 75% 90%,rgba(236,72,153,.09) 0%,transparent 55%)"}}/>
        {/* subtle grid lines */}
        <div style={{position:"absolute",inset:0,opacity:.025,
          backgroundImage:"linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)",
          backgroundSize:"60px 60px"}}/>
      </div>

      {pkResult&&<WinnerOverlay result={pkResult} onDone={()=>setPKRes(null)}/>}
      {gifts.map(g=><GiftToast key={g.id} g={g} onDone={()=>setGifts(p=>p.filter(x=>x.id!==g.id))}/>)}

      {/* ── HEADER ── */}
      <header style={{
        position:"relative",zIndex:10,height:52,flexShrink:0,
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"0 20px",
        background:"rgba(6,4,16,.85)",backdropFilter:"blur(24px)",
        borderBottom:`1px solid ${C.border}`,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>router.push("/rooms")} style={{
            padding:"5px 14px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:500,
            background:"rgba(255,255,255,.06)",border:`1px solid ${C.borderLo}`,
            color:C.textMid,transition:"all .15s",
          }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,.1)"}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,.06)"}
          >← Rời phòng</button>

          <div style={{width:1,height:20,background:C.borderLo}}/>

          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:15,fontWeight:700,letterSpacing:"-.01em"}}>
              🎤 KTV · <span style={{color:C.purple}}>{roomId}</span>
            </span>
            {isHost&&<Pill text="👑 Host" bg={C.goldLo} color={C.gold} border="rgba(245,158,11,.3)"/>}
            {myRole==="mic"&&<Pill text="🎤 Mic" bg={C.purpleLo} color={C.purple} border="rgba(139,92,246,.35)"/>}
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:20,
            background:connected?"rgba(239,68,68,.1)":"rgba(255,255,255,.05)",
            border:`1px solid ${connected?"rgba(239,68,68,.3)":C.borderLo}`}}>
            {connected&&<div style={{width:6,height:6,borderRadius:"50%",background:C.red,
              boxShadow:`0 0 6px ${C.red}`,animation:"blink 1.4s ease-in-out infinite"}}/>}
            <span style={{fontSize:11,fontWeight:600,color:connected?C.red:C.textLow,letterSpacing:".08em"}}>
              {connected?"LIVE":"Offline"}
            </span>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:C.textMid}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span style={{fontVariantNumeric:"tabular-nums"}}>{participants.length}</span>
          </div>

          <div style={{display:"flex"}}>
            {participants.slice(0,5).map((p,i)=>(
              <div key={p.id} style={{marginLeft:i===0?0:-8,zIndex:5-i,position:"relative"}}>
                <Av id={p.id} name={p.name} sz={28} glow={p.id===micUid}/>
              </div>
            ))}
            {participants.length>5&&(
              <div style={{width:28,height:28,borderRadius:"50%",marginLeft:-8,
                background:"rgba(255,255,255,.07)",border:`2px solid ${C.bg}`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:9,color:C.textLow}}>+{participants.length-5}</div>
            )}
          </div>
        </div>
      </header>

      {/* ── BODY ── */}
      <div style={{position:"relative",zIndex:1,display:"flex",flex:1,overflow:"hidden"}}>

        {/* ═══ LEFT 268px ═══ */}
        <aside style={{
          width:268,flexShrink:0,display:"flex",flexDirection:"column",
          borderRight:`1px solid ${C.border}`,
          background:"rgba(14,11,26,.6)",backdropFilter:"blur(12px)",
          overflowY:"auto",
        }}>
          {/* mic section header */}
          <div style={{padding:"14px 16px 10px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:11,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.textLow}}>
              Mic Slots
            </span>
            {micReqs.length>0&&isHost&&(
              <span style={{padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600,
                background:"rgba(236,72,153,.15)",color:C.pink,border:"1px solid rgba(236,72,153,.3)"}}>
                {micReqs.length} chờ duyệt
              </span>
            )}
          </div>

          <MicGrid participants={participants as any} micUid={micUid} micReqs={micReqs}
            isHost={isHost} myId={userId} myRole={myRole}
            onReq={requestMic} onApprove={approveMic} onReject={rejectMic} onRelease={releaseMic}/>

          <div style={{height:1,background:C.border,margin:"0 16px 14px"}}/>

          {/* members */}
          <div style={{padding:"0 16px",flex:1}}>
            <span style={{fontSize:11,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",
              color:C.textLow,display:"block",marginBottom:10}}>
              Thành viên ({participants.length})
            </span>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {participants.map(p=>(
                <div key={p.id} style={{
                  display:"flex",alignItems:"center",gap:10,
                  padding:"8px 10px",borderRadius:10,
                  background:p.id===micUid?"rgba(139,92,246,.08)":"rgba(255,255,255,.025)",
                  border:`1px solid ${p.id===micUid?C.border:C.borderLo}`,
                  transition:"all .2s",
                }}>
                  <Av id={p.id} name={p.name} sz={28} glow={p.id===micUid} pulse={p.id===micUid}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {p.name}
                    </div>
                    <div style={{fontSize:10,color:C.textLow,marginTop:1}}>
                      {p.isHost?"👑 Host":p.id===micUid?"🎤 Đang hát":"👁 Xem"}
                    </div>
                  </div>
                  {(myRole==="mic"||isHost)&&p.id!==userId&&!pkState&&(
                    <button onClick={()=>challengePK(p.id)} title="Thách đấu PK" style={{
                      width:26,height:26,borderRadius:6,border:"none",cursor:"pointer",
                      background:"rgba(239,68,68,.1)",color:"rgba(239,68,68,.7)",
                      fontSize:13,flexShrink:0,transition:"all .15s",
                    }}
                      onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="rgba(239,68,68,.2)"}
                      onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="rgba(239,68,68,.1)"}
                    >⚔️</button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div style={{height:16}}/>
        </aside>

        {/* ═══ CENTER flex-1 ═══ */}
        <main style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0,padding:"14px 20px",gap:12}}>

          {/* join requests */}
          {isHost&&joinReqs.length>0&&(
            <div style={{padding:"10px 16px",borderRadius:12,
              background:"rgba(245,158,11,.07)",border:"1px solid rgba(245,158,11,.2)",
              display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
              <span style={{fontSize:12,color:C.gold,fontWeight:600}}>
                Yêu cầu vào phòng ({joinReqs.length}):
              </span>
              {joinReqs.map(r=>(
                <div key={r.userId} style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,color:C.textMid}}>{r.userName}</span>
                  <button onClick={()=>approveJoin(r.userId)} style={{
                    padding:"3px 9px",borderRadius:6,border:"none",cursor:"pointer",
                    background:"rgba(16,185,129,.15)",color:"#6ee7b7",fontSize:11,fontWeight:500}}>✓</button>
                  <button onClick={()=>rejectJoin(r.userId)} style={{
                    padding:"3px 8px",borderRadius:6,border:"none",cursor:"pointer",
                    background:"rgba(239,68,68,.12)",color:"#fca5a5",fontSize:11}}>✗</button>
                </div>
              ))}
            </div>
          )}

          {/* PK bar */}
          {pkState&&<PKBar pk={pkState} myId={userId} onVote={votePK}/>}

          {/* now playing — main card */}
          <div style={{
            borderRadius:18,padding:"20px 24px",flexShrink:0,
            background:`linear-gradient(135deg,${C.surfaceHi},${C.surface})`,
            border:`1px solid ${C.border}`,
            boxShadow:"0 4px 32px rgba(139,92,246,.08),0 1px 0 rgba(255,255,255,.04) inset",
          }}>
            <div style={{display:"flex",alignItems:"center",gap:18}}>
              {/* disc art */}
              <div style={{
                width:64,height:64,borderRadius:14,flexShrink:0,
                background:"linear-gradient(145deg,#1e1b4b,#3730a3,#4c1d95)",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,
                boxShadow: roomState?.isPlaying
                  ?"0 0 0 1px rgba(139,92,246,.3),0 8px 24px rgba(139,92,246,.3)"
                  :"0 2px 12px rgba(0,0,0,.4)",
                animation:roomState?.isPlaying?"slowSpin 12s linear infinite":"none",
                transition:"box-shadow .4s",
              }}>🎵</div>

              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,color:C.purple,fontWeight:600,letterSpacing:".08em",
                  textTransform:"uppercase",marginBottom:4}}>
                  {roomState?.isPlaying?"▶ Đang phát":"⏸ Tạm dừng"}
                </div>
                <div style={{fontSize:18,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",
                  whiteSpace:"nowrap",textTransform:"capitalize",letterSpacing:"-.01em",marginBottom:2}}>
                  {songName}
                </div>
              </div>

              {isHost&&(
                <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                  <button onClick={roomState?.isPlaying?handlePause:handlePlay} style={{
                    width:44,height:44,borderRadius:12,border:"none",cursor:"pointer",
                    background:"linear-gradient(135deg,#8b5cf6,#ec4899)",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    color:"white",fontSize:18,
                    boxShadow:"0 4px 16px rgba(139,92,246,.4)",transition:"transform .15s",
                  }}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform="scale(1.07)"}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform="scale(1)"}
                  >{roomState?.isPlaying?"⏸":"▶"}</button>
                  {queue.length>0&&(
                    <button onClick={()=>sendWS("SONG_QUEUE_NEXT",{})} style={{
                      width:36,height:36,borderRadius:10,border:`1px solid ${C.borderLo}`,
                      background:"rgba(255,255,255,.06)",cursor:"pointer",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      color:C.textMid,fontSize:14,transition:"all .15s",
                    }}
                      onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,.1)"}
                      onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,.06)"}
                    >⏭</button>
                  )}
                </div>
              )}
            </div>

            <div style={{marginTop:16}}>
              <ProgressBar audioRef={audioRef} isHost={isHost} onSeek={handleSeek}/>
            </div>
          </div>

          {/* autoplay nudge */}
          {needsInteraction&&roomState?.isPlaying&&(
            <div style={{padding:"10px 16px",borderRadius:12,
              background:C.purpleLo,border:`1px solid rgba(139,92,246,.3)`,
              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:12,color:C.purple}}>🎵 Phòng đang phát nhạc</span>
              <button onClick={handleInteract} style={{
                padding:"6px 18px",borderRadius:8,border:"none",cursor:"pointer",
                background:"linear-gradient(135deg,#8b5cf6,#ec4899)",
                color:"white",fontSize:12,fontWeight:600}}>Nghe cùng</button>
            </div>
          )}

          {/* song queue */}
          <div style={{borderRadius:14,overflow:"hidden",border:`1px solid ${C.borderLo}`,
            background:"rgba(255,255,255,.02)"}}>
            <button onClick={()=>setShowQueue(!showQueue)} style={{
              width:"100%",padding:"11px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",
              background:"none",border:"none",cursor:"pointer",color:C.textMid,fontSize:13,fontWeight:500,
            }}>
              <span style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:15}}>🎵</span>
                Hàng đợi
                <span style={{
                  padding:"1px 8px",borderRadius:20,fontSize:11,
                  background:queue.length>0?C.purpleLo:"rgba(255,255,255,.05)",
                  color:queue.length>0?C.purple:C.textLow,
                  border:`1px solid ${queue.length>0?"rgba(139,92,246,.3)":C.borderLo}`,
                }}>{queue.length} bài</span>
              </span>
              <span style={{fontSize:10,transition:"transform .2s",
                transform:showQueue?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
            </button>

            {showQueue&&(
              <div style={{borderTop:`1px solid ${C.borderLo}`}}>
                {/* add form */}
                <div style={{padding:"10px 14px",display:"flex",gap:6,
                  borderBottom:`1px solid ${C.borderLo}`,background:"rgba(0,0,0,.15)"}}>
                  <input placeholder="Tên bài *" value={songForm.title}
                    onChange={e=>setSongForm(p=>({...p,title:e.target.value}))}
                    onKeyDown={e=>{if(e.key==="Enter")addSong();}}
                    style={inputStyle}/>
                  <input placeholder="Nghệ sĩ" value={songForm.artist}
                    onChange={e=>setSongForm(p=>({...p,artist:e.target.value}))}
                    style={{...inputStyle,maxWidth:110}}/>
                  <button onClick={addSong} style={{
                    padding:"0 14px",borderRadius:8,border:"none",cursor:"pointer",
                    background:"linear-gradient(135deg,#8b5cf6,#ec4899)",
                    color:"white",fontSize:12,fontWeight:600,flexShrink:0,
                  }}>+ Thêm</button>
                </div>
                {/* list */}
                <div style={{maxHeight:200,overflowY:"auto"}}>
                  {queue.length===0?(
                    <div style={{padding:"18px",textAlign:"center",fontSize:12,color:C.textLow}}>Hàng đợi trống</div>
                  ):queue.map((s,i)=>(
                    <div key={s.id} style={{
                      display:"flex",alignItems:"center",gap:10,padding:"9px 14px",
                      borderBottom:`1px solid rgba(255,255,255,.03)`,
                      background:i===0?"rgba(139,92,246,.05)":"transparent",
                      transition:"background .15s",
                    }}
                      onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=i===0?"rgba(139,92,246,.08)":"rgba(255,255,255,.025)"}
                      onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=i===0?"rgba(139,92,246,.05)":"transparent"}
                    >
                      <div style={{
                        width:22,height:22,borderRadius:6,flexShrink:0,
                        background:i===0?"linear-gradient(135deg,#8b5cf6,#ec4899)":"rgba(255,255,255,.07)",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:10,fontWeight:700,color:i===0?"white":C.textLow,
                      }}>{i===0?"▶":i+1}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {s.title}
                        </div>
                        <div style={{fontSize:10,color:C.textLow}}>{s.artist} · {s.requestedByName}</div>
                      </div>
                      {(isHost||s.requestedBy===userId)&&(
                        <button onClick={()=>sendWS("SONG_QUEUE_REMOVE",{id:s.id})} style={{
                          background:"none",border:"none",color:C.textLow,cursor:"pointer",
                          fontSize:18,flexShrink:0,padding:0,lineHeight:1,transition:"color .15s",
                        }}
                          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color="#fca5a5"}
                          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color=C.textLow}
                        >×</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ═══ RIGHT 330px ═══ */}
        <aside style={{
          width:330,flexShrink:0,display:"flex",flexDirection:"column",
          borderLeft:`1px solid ${C.border}`,
          background:"rgba(8,5,18,.7)",backdropFilter:"blur(16px)",
        }}>
          <div style={{padding:"13px 18px 10px",borderBottom:`1px solid ${C.borderLo}`,
            display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
            <span style={{fontSize:11,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.textLow}}>
              Chat trực tiếp
            </span>
            <span style={{fontSize:11,color:C.textLow,fontVariantNumeric:"tabular-nums"}}>
              {isLoading?"…":`${messages.length} tin`}
            </span>
          </div>

          {/* messages */}
          <div style={{flex:1,overflowY:"auto",padding:"14px 14px 8px",display:"flex",flexDirection:"column",gap:10}}>
            {isLoading?(
              <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:5,opacity:.3}}>
                {[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:"50%",background:"white",
                  animation:`bounce 1.2s ease-in-out ${i*.18}s infinite`}}/>)}
              </div>
            ):messages.length===0?(
              <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
                flexDirection:"column",gap:8,opacity:.2}}>
                <div style={{fontSize:28}}>💬</div>
                <div style={{fontSize:12}}>Chưa có tin nhắn</div>
              </div>
            ):messages.map((m,i)=>{
              const isSticker=typeof m.content==="string"&&m.content.startsWith("[sticker]");
              return (
                <div key={m.id??m._id??i} style={{display:"flex",flexDirection:"column",
                  alignItems:m.isMine?"flex-end":"flex-start"}}>
                  <span style={{fontSize:10,marginBottom:3,fontWeight:500,
                    color:m.isMine?"rgba(236,72,153,.7)":"rgba(139,92,246,.65)",
                    paddingLeft:m.isMine?0:3,paddingRight:m.isMine?3:0,
                  }}>{m.isMine?"Bạn":m.userName}</span>
                  <div style={{
                    maxWidth:"82%",
                    padding:isSticker?4:"8px 13px",
                    borderRadius:m.isMine?"14px 14px 3px 14px":"14px 14px 14px 3px",
                    background:isSticker?"transparent"
                      :m.isMine?"linear-gradient(135deg,#8b5cf6,#ec4899)"
                      :"rgba(255,255,255,.07)",
                    border:`1px solid ${m.isMine?"transparent":C.borderLo}`,
                    fontSize:13,color:C.text,lineHeight:1.55,wordBreak:"break-word",
                  }}>
                    {isSticker
                      ?<img src={m.content!.replace("[sticker]","")} alt="" style={{width:96,height:96,objectFit:"cover",borderRadius:10,display:"block"}}/>
                      :m.content}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef}/>
          </div>

          {/* gift panel */}
          {showGift&&(
            <div style={{
              borderTop:`1px solid ${C.border}`,
              background:"rgba(10,7,22,.97)",
              animation:"slideUp .22s ease",flexShrink:0,
            }}>
              <div style={{padding:"12px 16px 8px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:13,fontWeight:600}}>Tặng quà</span>
                <button onClick={()=>{setShowGift(false);setGiftTarget("");}} style={{
                  background:"none",border:"none",color:C.textLow,cursor:"pointer",fontSize:20,lineHeight:1}}>×</button>
              </div>

              {/* target */}
              <div style={{padding:"0 16px 8px",display:"flex",flexWrap:"wrap",gap:5}}>
                {participants.filter(p=>p.id!==userId).map(p=>(
                  <button key={p.id} onClick={()=>setGiftTarget(p.id)} style={{
                    padding:"4px 11px",borderRadius:20,cursor:"pointer",fontSize:11,fontWeight:500,
                    border:`1px solid ${giftTarget===p.id?"rgba(139,92,246,.55)":C.borderLo}`,
                    background:giftTarget===p.id?C.purpleLo:"rgba(255,255,255,.04)",
                    color:giftTarget===p.id?C.purple:C.textMid,transition:"all .15s",
                  }}>{p.name}{p.isHost?" 👑":""}</button>
                ))}
              </div>

              {/* gifts */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,padding:"0 16px 14px"}}>
                {GIFTS.map(g=>{
                  const tgt=participants.find(p=>p.id===giftTarget);
                  return (
                    <button key={g.type} disabled={!giftTarget}
                      onClick={()=>tgt&&sendGift(giftTarget,tgt.name,g)}
                      style={{
                        padding:"10px 4px",borderRadius:12,cursor:giftTarget?"pointer":"not-allowed",
                        border:`1px solid ${C.borderLo}`,
                        background:giftTarget?"rgba(255,255,255,.04)":"rgba(255,255,255,.02)",
                        textAlign:"center",opacity:giftTarget?1:.4,transition:"all .15s",
                      }}
                      onMouseEnter={e=>{if(giftTarget)(e.currentTarget as HTMLElement).style.background="rgba(139,92,246,.12)";}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=giftTarget?"rgba(255,255,255,.04)":"rgba(255,255,255,.02)";}}
                    >
                      <div style={{fontSize:24}}>{g.emoji}</div>
                      <div style={{fontSize:11,color:C.textMid,marginTop:2,fontWeight:500}}>{g.name}</div>
                      <div style={{fontSize:10,color:C.textLow}}>{g.cost}xu</div>
                    </button>
                  );
                })}
              </div>
              {!giftTarget&&<div style={{textAlign:"center",fontSize:11,color:C.textLow,paddingBottom:10}}>Chọn người nhận trước</div>}
            </div>
          )}

          {/* chat input */}
          <div style={{padding:"10px 14px 12px",borderTop:`1px solid ${C.borderLo}`,
            background:"rgba(0,0,0,.2)",flexShrink:0}}>
            {/* toolbar */}
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              <IconBtn active={showGift} emoji="🎁" title="Tặng quà"
                onClick={()=>{setShowGift(!showGift);setShowPKMenu(false);}}/>

              {(myRole==="mic"||isHost)&&!pkState&&(
                <div style={{position:"relative"}}>
                  <IconBtn active={showPKMenu} emoji="⚔️" title="PK"
                    onClick={()=>{setShowPKMenu(!showPKMenu);setShowGift(false);}}/>
                  {showPKMenu&&(
                    <div style={{
                      position:"absolute",bottom:"calc(100% + 8px)",left:0,
                      background:"rgba(12,9,28,.97)",border:`1px solid ${C.border}`,
                      borderRadius:14,padding:"6px 0",minWidth:172,zIndex:200,
                      boxShadow:"0 8px 36px rgba(0,0,0,.55)",animation:"slideUp .18s ease",
                    }}>
                      <div style={{padding:"6px 14px 4px",fontSize:10,fontWeight:600,
                        color:C.textLow,letterSpacing:".08em",textTransform:"uppercase"}}>
                        Thách đấu với
                      </div>
                      {participants.filter(p=>p.id!==userId).map(p=>(
                        <button key={p.id} onClick={()=>challengePK(p.id)} style={{
                          display:"flex",alignItems:"center",gap:8,width:"100%",
                          padding:"8px 14px",background:"none",border:"none",
                          color:C.textMid,cursor:"pointer",fontSize:13,fontWeight:500,
                          transition:"all .15s",
                        }}
                          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,.06)";(e.currentTarget as HTMLElement).style.color=C.text;}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="none";(e.currentTarget as HTMLElement).style.color=C.textMid;}}
                        >
                          <Av id={p.id} name={p.name} sz={22}/>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{display:"flex",gap:7,alignItems:"center"}}>
              <input type="text" placeholder="Nhắn gì đó..."
                value={chatText}
                onChange={e=>setChatText(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"){sendChat();setShowGift(false);setShowPKMenu(false);}}}
                style={{
                  flex:1,background:"rgba(255,255,255,.07)",
                  border:`1px solid ${C.borderLo}`,borderRadius:22,
                  padding:"9px 16px",color:C.text,fontSize:13,outline:"none",
                  fontFamily:"Inter,sans-serif",transition:"border-color .15s",
                }}
                onFocus={e=>(e.target as HTMLInputElement).style.borderColor="rgba(139,92,246,.45)"}
                onBlur={e=>(e.target as HTMLInputElement).style.borderColor=C.borderLo}
              />
              <button onClick={()=>sendChat()} disabled={!chatText.trim()} style={{
                width:38,height:38,borderRadius:"50%",border:"none",flexShrink:0,
                cursor:chatText.trim()?"pointer":"not-allowed",
                background:chatText.trim()?"linear-gradient(135deg,#8b5cf6,#ec4899)":"rgba(255,255,255,.06)",
                color:"white",opacity:chatText.trim()?1:.4,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:15,transition:"all .2s",
                boxShadow:chatText.trim()?"0 2px 12px rgba(139,92,246,.35)":"none",
              }}>➤</button>
            </div>
          </div>
        </aside>
      </div>

      <audio ref={audioRef}/>

      <style>{`
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(139,92,246,.35);border-radius:2px;}

        @keyframes ring     {0%{transform:scale(1);opacity:.7}100%{transform:scale(1.55);opacity:0}}
        @keyframes blink    {0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes bounce   {0%,100%{transform:scale(.65);opacity:.3}50%{transform:scale(1);opacity:1}}
        @keyframes slowSpin {to{transform:rotate(360deg)}}
        @keyframes gUp      {0%{opacity:0;transform:translateY(24px) scale(.9)}12%{opacity:1;transform:translateY(0) scale(1.03)}80%{opacity:1;transform:translateY(-12px)}100%{opacity:0;transform:translateY(-36px) scale(.92)}}
        @keyframes fdIn     {from{opacity:0}to{opacity:1}}
        @keyframes slideUp  {from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes winPop   {0%{transform:scale(.4);opacity:0}65%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
        @keyframes spin     {to{transform:rotate(360deg)}}
      `}</style>
    </div>
  );
}

/* ─── tiny helpers ─────────────────────────────────────────────────────────── */
function Pill({text,bg,color,border}:{text:string;bg:string;color:string;border:string}) {
  return (
    <span style={{padding:"2px 9px",borderRadius:20,fontSize:10,fontWeight:600,
      background:bg,color,border:`1px solid ${border}`}}>{text}</span>
  );
}
function IconBtn({emoji,title,active,onClick}:{emoji:string;title:string;active:boolean;onClick:()=>void}) {
  const C2={purpleLo:"rgba(139,92,246,.15)",purple:"#8b5cf6"};
  return (
    <button onClick={onClick} title={title} style={{
      width:34,height:34,borderRadius:9,border:`1px solid ${active?"rgba(139,92,246,.4)":"rgba(255,255,255,.09)"}`,
      cursor:"pointer",background:active?C2.purpleLo:"rgba(255,255,255,.06)",
      color:"white",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center",
      transition:"all .15s",
    }}
      onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=active?"rgba(139,92,246,.22)":"rgba(255,255,255,.1)"}
      onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=active?C2.purpleLo:"rgba(255,255,255,.06)"}
    >{emoji}</button>
  );
}

const inputStyle:React.CSSProperties={
  flex:1,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.09)",
  borderRadius:8,padding:"7px 10px",color:"rgba(255,255,255,.9)",fontSize:12,
  outline:"none",fontFamily:"Inter,sans-serif",minWidth:0,
};