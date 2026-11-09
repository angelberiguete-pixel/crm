import "./empresia-brand.css";

/** Public and commercial Empresia pages retain one light visual identity.
 * Client workspaces still use their tenant-specific themes.
 */
export default function EmpresiaLayout({children}:{children:React.ReactNode}){
 return <div className="empresia-brand-scope">{children}</div>;
}
