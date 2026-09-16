export const cevicosContact = {
  whatsappDisplay: "+1 849 570 6550",
  whatsappDigits: "18495706550",
  whatsappMessage: "Hola, estoy interesado(a) en la propiedad de aproximadamente 812 tareas en Cevicos, Sánchez Ramírez. Quiero recibir información y coordinar los próximos pasos.",
};

export function cevicosWhatsappUrl(message = cevicosContact.whatsappMessage) {
  return `https://wa.me/${cevicosContact.whatsappDigits}?text=${encodeURIComponent(message)}`;
}
