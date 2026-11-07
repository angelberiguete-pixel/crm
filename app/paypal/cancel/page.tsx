export default function PayPalCancelPage(){
  return <main style={{maxWidth:560,margin:"6rem auto",padding:"1.5rem",fontFamily:"system-ui"}}>
    <h1>Pago no completado</h1>
    <p>Regresaste de PayPal sin confirmar el pago. No se registrará como cobrado
    hasta recibir una confirmación oficial de PayPal.</p>
  </main>;
}
