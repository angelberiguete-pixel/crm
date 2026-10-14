import Image from "next/image";

export default function BrandLogo({size="sidebar",label=true}:{size?:"sidebar"|"login"|"compact"|"loading";label?:boolean}){
  return <span className={`look-brand-logo look-brand-logo--${size}`}>
    <Image src="/look-social-media-logo.svg" alt={label?"LOOK SOCIAL MEDIA":""} width={220} height={182} priority={size==="login"} unoptimized/>
  </span>;
}
