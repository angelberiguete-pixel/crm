"use client";

import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";

const money=(value:number)=>new Intl.NumberFormat("es-DO",{style:"currency",currency:"DOP",maximumFractionDigits:0}).format(Number.isFinite(value)?value:0);

export default function PriceCalculator(){
  const [tasks,setTasks]=useState(812);
  const [price,setPrice]=useState(80000);
  const total=useMemo(()=>Math.max(0,tasks)*Math.max(0,price),[tasks,price]);

  return <section id="calculator" style={{padding:"64px 18px",background:"#f5f2e9",color:"#173329"}}>
    <div style={{maxWidth:1120,margin:"0 auto",background:"linear-gradient(135deg,#fff,#faf5e7)",border:"1px solid #dfd2ae",borderRadius:24,padding:"clamp(22px,5vw,36px)",boxShadow:"0 18px 55px rgba(23,51,41,.07)"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:26,alignItems:"center"}}>
        <div>
          <div style={{display:"inline-flex",alignItems:"center",gap:8,fontSize:12,fontWeight:900,letterSpacing:1.2,color:"#8c6a22"}}><Calculator size={16}/> CALCULADORA DE PRECIO</div>
          <h2 style={{fontSize:"clamp(30px,5vw,48px)",letterSpacing:"-.04em",margin:"12px 0"}}>Calcula el valor por tareas.</h2>
          <p style={{color:"#60736c",lineHeight:1.65}}>Modifica la cantidad de tareas y el precio por tarea para explorar escenarios. La referencia comercial actual es RD$80,000 por tarea.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginTop:18}}>
            <label style={label}>Cantidad de tareas<input style={input} type="number" min="0" max="812" step="0.01" value={tasks} onChange={e=>setTasks(Number(e.target.value||0))}/></label>
            <label style={label}>Precio por tarea (RD$)<input style={input} type="number" min="0" step="1000" value={price} onChange={e=>setPrice(Number(e.target.value||0))}/></label>
          </div>
          <p style={{fontSize:12,lineHeight:1.55,color:"#71827b",marginTop:14}}>Cálculo ilustrativo. La venta parcial no está confirmada. Cualquier modalidad depende de aprobación de los propietarios y de verificación legal, registral, catastral y técnica.</p>
        </div>
        <div style={{background:"#173329",color:"#fff",borderRadius:20,padding:"clamp(22px,5vw,30px)"}}>
          <span style={{color:"#bfd0ca"}}>Total estimado</span>
          <strong style={{display:"block",fontSize:"clamp(36px,6vw,58px)",letterSpacing:"-.045em",color:"#efd28a",margin:"8px 0"}}>{money(total)}</strong>
          <div>{tasks.toLocaleString("es-DO")} tareas × {money(price)}</div>
        </div>
      </div>
    </div>
  </section>;
}

const label:React.CSSProperties={display:"grid",gap:6,fontSize:13,fontWeight:850};
const input:React.CSSProperties={width:"100%",boxSizing:"border-box",border:"1px solid #d8d3c5",borderRadius:12,padding:"12px 13px",font:"inherit",background:"#fff",color:"#173329"};
