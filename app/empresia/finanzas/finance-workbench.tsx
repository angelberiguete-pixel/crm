"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Calculator,
  CheckCircle2,
  CircleAlert,
  Landmark,
  PiggyBank,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import styles from "./finance-workbench.module.css";

export type FinanceSection = "wealth" | "invest" | "capital";

const areas: { id: FinanceSection; title: string; subtitle: string; path: string }[] = [
  { id: "wealth", title: "Wealth", subtitle: "Organiza tus finanzas", path: "/empresia/wealth" },
  { id: "invest", title: "Invest", subtitle: "Explora escenarios", path: "/empresia/invest" },
  { id: "capital", title: "Capital", subtitle: "Prepara proyectos", path: "/empresia/capital" },
];

const dop = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 })
    .format(Number.isFinite(n) ? n : 0);

function AmountInput({ label, value, onChange, max = 100000000 }: {
  label: string; value: number; onChange: (n: number) => void; max?: number;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        type="number"
        min="0"
        max={max}
        step="100"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
      />
    </label>
  );
}

function Wealth() {
  const [income, setIncome] = useState(45000);
  const [fixed, setFixed] = useState(18000);
  const [variable, setVariable] = useState(12000);
  const [goal, setGoal] = useState(100000);
  const available = income - fixed - variable;
  const months = available > 0 && goal > 0 ? Math.ceil(goal / available) : null;
  const savingsRate = income > 0 ? Math.max(0, available / income * 100) : 0;
  return (
    <div className={styles.workArea}>
      <div className={styles.sectionHeading}>
        <div><p className={styles.kicker}>EMPRESIA WEALTH</p><h2>Tu dinero, bajo control</h2>
          <p>Organiza ingresos, gastos y metas. Calcula cuánto puedes reservar cada mes, sin conectarte a tu banco.</p>
        </div><PiggyBank size={36} aria-hidden="true" />
      </div>
      <div className={styles.columns}>
        <div className={styles.formCard}>
          <h3>Planificador mensual</h3>
          <div className={styles.formGrid}>
            <AmountInput label="Ingresos mensuales (RD$)" value={income} onChange={setIncome} />
            <AmountInput label="Gastos fijos (RD$)" value={fixed} onChange={setFixed} />
            <AmountInput label="Gastos variables (RD$)" value={variable} onChange={setVariable} />
            <AmountInput label="Meta de ahorro (RD$)" value={goal} onChange={setGoal} />
          </div>
          <p className={styles.help}>Los datos se calculan en tu navegador. No se envían ni guardan en una cuenta financiera.</p>
        </div>
        <div className={styles.resultCard}>
          <span className={styles.resultLabel}>Disponible estimado cada mes</span>
          <strong className={available < 0 ? styles.negative : styles.bigNumber}>{dop(available)}</strong>
          <div className={styles.metricRow}><span>Porcentaje potencial de ahorro</span><b>{savingsRate.toFixed(1)}%</b></div>
          <div className={styles.track}><div style={{ width: Math.min(100, savingsRate) + "%" }} /></div>
          <div className={styles.metricRow}><span>Tiempo estimado para tu meta</span><b>{months === null ? "No calculable" : months + (months === 1 ? " mes" : " meses")}</b></div>
          {available < 0 ? <p className={styles.warning}><CircleAlert size={17} /> Los gastos superan tus ingresos.</p> :
            <p className={styles.tip}>Proyección simple sin intereses, impuestos, inflación ni cambios en tus gastos.</p>}
        </div>
      </div>
    </div>
  );
}

function Invest() {
  const [initial, setInitial] = useState(5000);
  const [monthly, setMonthly] = useState(1000);
  const [years, setYears] = useState(5);
  const [annualReturn, setAnnualReturn] = useState(5);
  const result = useMemo(() => {
    const count = Math.max(1, Math.min(480, years * 12));
    const monthRate = Math.pow(1 + annualReturn / 100, 1 / 12) - 1;
    let balance = initial;
    for (let i = 0; i < count; i++) balance = balance * (1 + monthRate) + monthly;
    const contributed = initial + monthly * count;
    return { balance, contributed, change: balance - contributed };
  }, [initial, monthly, years, annualReturn]);
  return (
    <div className={styles.workArea}>
      <div className={styles.sectionHeading}>
        <div><p className={styles.kicker}>EMPRESIA INVEST</p><h2>Aprende a evaluar escenarios</h2>
          <p>Explora el impacto del tiempo, las aportaciones y diferentes rendimientos hipotéticos.</p>
        </div><BarChart3 size={36} aria-hidden="true" />
      </div>
      <div className={styles.columns}>
        <div className={styles.formCard}>
          <h3>Simulador educativo</h3>
          <div className={styles.formGrid}>
            <AmountInput label="Capital inicial (RD$)" value={initial} onChange={setInitial} />
            <AmountInput label="Aporte mensual (RD$)" value={monthly} onChange={setMonthly} />
            <label className={styles.field}><span>Duración (años)</span>
              <input type="number" value={years} min="1" max="40" step="1" onChange={e => setYears(Math.max(1, Math.min(40, Math.trunc(Number(e.target.value) || 1))))} />
            </label>
            <label className={styles.field}><span>Rendimiento anual hipotético (%)</span>
              <input type="number" value={annualReturn} min="-20" max="20" step="0.5" onChange={e => setAnnualReturn(Math.max(-20, Math.min(20, Number(e.target.value) || 0)))} />
            </label>
          </div>
          <p className={styles.help}>Utiliza una tasa de escenario, no la rentabilidad prometida de ningún producto.</p>
        </div>
        <div className={styles.resultCard}>
          <span className={styles.resultLabel}>Valor futuro hipotético</span>
          <strong className={styles.bigNumber}>{dop(result.balance)}</strong>
          <div className={styles.metricRow}><span>Total aportado</span><b>{dop(result.contributed)}</b></div>
          <div className={styles.metricRow}><span>Ganancia o pérdida hipotética</span>
            <b className={result.change < 0 ? styles.negative : undefined}>{dop(result.change)}</b></div>
          <p className={styles.warning}><CircleAlert size={17} /> Una inversión real puede perder capital. Esta simulación no es una oferta, recomendación individual ni garantía de ganancias.</p>
        </div>
      </div>
      <div className={styles.infoCard}><ShieldCheck size={22}/><div><b>Operaciones reales: no habilitadas</b>
        <p>En una fase posterior, solo se conectarán productos e intermediarios autorizados, con información sobre riesgos, tarifas y elegibilidad.</p></div>
      </div>
    </div>
  );
}

const requirements = [
  { id: "legal", title: "Documentación legal de la empresa" },
  { id: "financial", title: "Estados financieros verificables" },
  { id: "plan", title: "Plan de negocio y uso de fondos" },
  { id: "risks", title: "Descripción de riesgos y contingencias" },
  { id: "governance", title: "Responsables y estructura de gobierno" },
];
function Capital() {
  const [company, setCompany] = useState("");
  const [sector, setSector] = useState("comercio");
  const [requested, setRequested] = useState(250000);
  const [checks, setChecks] = useState<string[]>([]);
  const progress = Math.round(checks.length / requirements.length * 100);
  return (
    <div className={styles.workArea}>
      <div className={styles.sectionHeading}>
        <div><p className={styles.kicker}>EMPRESIA CAPITAL</p><h2>Prepara tu negocio para presentar un proyecto</h2>
          <p>Organiza la información que podrían revisar asesores, inversionistas e instituciones autorizadas.</p>
        </div><Building2 size={36} aria-hidden="true" />
      </div>
      <div className={styles.columns}>
        <div className={styles.formCard}>
          <h3>Evaluación preliminar del proyecto</h3>
          <div className={styles.formGrid}>
            <label className={styles.field}><span>Nombre del proyecto</span>
              <input type="text" maxLength={100} placeholder="Ej. Expansión de mi negocio" value={company} onChange={e => setCompany(e.target.value)} />
            </label>
            <label className={styles.field}><span>Sector</span>
              <select value={sector} onChange={e => setSector(e.target.value)}>
                <option value="comercio">Comercio</option><option value="servicios">Servicios</option>
                <option value="industria">Industria</option><option value="tecnologia">Tecnología</option>
                <option value="otro">Otro</option>
              </select>
            </label>
            <AmountInput label="Monto que busca financiar (RD$)" value={requested} onChange={setRequested}/>
          </div>
          <h3 className={styles.subheading}>Lista de preparación</h3>
          <div className={styles.checks}>
            {requirements.map(item => (
              <label key={item.id} className={styles.checkLine}>
                <input type="checkbox" checked={checks.includes(item.id)}
                  onChange={e => setChecks(old => e.target.checked ? [...old, item.id] : old.filter(v => v !== item.id))}/>
                <span>{item.title}</span>
              </label>
            ))}
          </div>
        </div>
        <div className={styles.resultCard}>
          <span className={styles.resultLabel}>Documentación preparada</span>
          <strong className={styles.bigNumber}>{progress}%</strong>
          <div className={styles.track}><div style={{ width: progress + "%" }} /></div>
          <div className={styles.metricRow}><span>Proyecto</span><b>{company.trim() || "Sin nombre"}</b></div>
          <div className={styles.metricRow}><span>Sector</span><b>{sector}</b></div>
          <div className={styles.metricRow}><span>Capital buscado</span><b>{dop(requested)}</b></div>
          <p className={styles.tip}>La lista es orientativa; no determina elegibilidad, aprobación ni valor financiero.</p>
          <p className={styles.warning}><CircleAlert size={17} /> No estamos publicando ofertas de inversión ni aceptando dinero. El financiamiento colaborativo requiere cumplir la regulación de la SIMV.</p>
        </div>
      </div>
    </div>
  );
}

export default function FinanceWorkbench({ section }: { section: FinanceSection }) {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/empresia" className={styles.brand} aria-label="Volver a Empresia"><span className={styles.brandMark}><Landmark size={20}/></span><span>EMPRESIA <small>FINANZAS</small></span></Link>
          <Link href="/empresia" className={styles.back}>Volver a Empresia <ArrowRight size={15}/></Link>
        </header>
        <div className={styles.hero}>
          <span className={styles.heroBadge}><ShieldCheck size={15}/> Herramientas financieras educativas · Acceso web</span>
          <h1>Organiza. Aprende. Prepara tu futuro financiero.</h1>
          <p>Un espacio integrado para tus finanzas personales, simulación de inversiones y preparación de proyectos empresariales.</p>
          <p className={styles.legalTop}>Actualmente no somos un banco, intermediario de valores, asesor de inversión autorizado ni plataforma de inversión colaborativa autorizada.</p>
        </div>
        <nav className={styles.tabs} aria-label="Áreas de Empresia Finanzas">
          {areas.map((area) => (
            <Link href={area.path} key={area.id} className={area.id === section ? styles.tabActive : styles.tab}
              aria-current={area.id === section ? "page" : undefined}>
              <span className={styles.tabName}>Empresia {area.title}</span>
              <span className={styles.tabSubtitle}>{area.subtitle}</span>
            </Link>
          ))}
        </nav>
        {section === "wealth" && <Wealth/>}
        {section === "invest" && <Invest/>}
        {section === "capital" && <Capital/>}
        <div className={styles.features}>
          <div><Wallet size={20}/><b>Sin custodia de fondos</b><p>Esta versión no recibe depósitos, pagos ni inversiones.</p></div>
          <div><Calculator size={20}/><b>Cálculos transparentes</b><p>Escenarios orientativos basados en los valores que introduces.</p></div>
          <div><CheckCircle2 size={20}/><b>Integración progresiva</b><p>Las operaciones reales requerirán socios y permisos aplicables.</p></div>
        </div>
        <footer className={styles.footer}>
          <span>© Empresia · Herramientas educativas, no servicios bancarios</span>
          <Link href="/empresia">Sitio principal</Link>
        </footer>
      </div>
    </main>
  );
}
