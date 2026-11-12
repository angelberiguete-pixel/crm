"use client";

import { type FormEvent, type ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  QA_CASES, EMPTY_QA_RECORD, parseQAReport, qaSummary, validateQARecord,
  type QACase, type QARecord, type QAStatus, type QAScope, type QAReport
} from "@/lib/qa-mobile";
import styles from "./qa-mobile-control-center.module.css";

const STORAGE_KEY = "empresia:qa69:fixture-only:v1";
const scopeLabel: Record<QAScope, string> = {
  fixture: "Simulación local", staging: "Staging sin verificar", integracion: "Proveedor no verificado"
};
const statusLabel: Record<QAStatus, string> = {
  pendiente: "Pendiente", bloqueada: "Bloqueada", fallida: "Fallida", aprobada: "Aprobada · fixture"
};
const freshRecord = (): QARecord => ({ ...EMPTY_QA_RECORD });

export default function QAMobileControlCenter() {
  const [records, setRecords] = useState<Record<string, QARecord>>({});
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState(QA_CASES[0].id);
  const [filter, setFilter] = useState("todos");
  const [scopeFilter, setScopeFilter] = useState("todos");
  const [form, setForm] = useState<QARecord>(freshRecord);
  const [notice, setNotice] = useState("");
  const selected = QA_CASES.find(item => item.id === selectedId) ?? QA_CASES[0];
  const summary = useMemo(() => qaSummary(records), [records]);
  const visible = useMemo(() => QA_CASES.filter(item => {
    const state = records[item.id]?.status ?? "pendiente";
    return (filter === "todos" || state === filter) && (scopeFilter === "todos" || item.scope === scopeFilter);
  }), [records, filter, scopeFilter]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setRecords(parseQAReport(JSON.parse(saved)));
    } catch {
      setNotice("Registro previo incompatible o dañado; no se cargaron resultados.");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      const report: QAReport = {
        schemaVersion: 1, issue: 69, mode: "fixture-only",
        generatedAt: new Date().toISOString(), records
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(report));
    } catch {
      setNotice("El navegador no permitió guardar el registro local. Exporta el informe para no perderlo.");
    }
  }, [records, loaded]);

  useEffect(() => {
    setForm(records[selectedId] ? { ...records[selectedId] } : freshRecord());
  }, [selectedId, records]);

  function change<K extends keyof QARecord>(key: K, value: QARecord[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }
  function selectCase(item: QACase) {
    setSelectedId(item.id);
    setNotice("");
  }
  function save(event: FormEvent) {
    event.preventDefault();
    const candidate: QARecord = { ...form, checkedAt: new Date().toISOString() };
    const error = validateQARecord(selected, candidate);
    if (error) { setNotice(error); return; }
    setRecords(current => ({ ...current, [selected.id]: candidate }));
    setNotice("Resultado registrado únicamente en este navegador. No constituye validación de producción.");
  }
  function exportReport() {
    const report: QAReport = {
      schemaVersion: 1, issue: 69, mode: "fixture-only",
      generatedAt: new Date().toISOString(), records
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "empresia-qa-issue-69-fixture.json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice("Informe JSON exportado. Conservarlo como evidencia de trabajo, no como autorización de salida.");
  }
  async function importReport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 500_000) { setNotice("El archivo supera 500 KB."); return; }
    try {
      const imported = parseQAReport(JSON.parse(await file.text()));
      setRecords(imported);
      setNotice("Informe local importado y validado. Ninguna prueba real fue aprobada.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo importar el informe.");
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.top}>
        <div className={styles.brand}><img src="/empresia-logo-light.svg" alt="Empresia" width={135} height={32} /><span>QUALITY LAB</span></div>
        <div className={styles.topActions}>
          <a href="https://github.com/angelberiguete-pixel/crm/issues/69" target="_blank" rel="noopener noreferrer">Issue #69 ↗</a>
          <button type="button" onClick={exportReport}>Exportar JSON</button>
          <label className={styles.importButton}>Importar JSON<input type="file" accept=".json,application/json" onChange={importReport} /></label>
        </div>
      </header>
      <div className={styles.layout}>
        <section className={styles.heading}>
          <p className={styles.eyebrow}>CONTROL DE CALIDAD · V1</p>
          <h1>Pruebas móviles de Empresia</h1>
          <p>Checklist operativo para Android con evidencias trazables. Sin conexión al CRM, sin escribir en Supabase y sin enviar mensajes ni pagos.</p>
          <div className={styles.guard}>
            <strong>Salida a beta bloqueada</strong>
            <span>Solo pruebas simuladas. Staging, accesos reales, RLS e integraciones requieren infraestructura separada y verificación independiente.</span>
          </div>
          <div className={styles.metrics}>
            <div><strong>{summary.total}</strong><span>Controles definidos</span></div>
            <div><strong>{summary.approvedFixture}</strong><span>Fixtures con evidencia</span></div>
            <div><strong>{summary.failed}</strong><span>Fallidos</span></div>
            <div><strong>{summary.blocked}</strong><span>Bloqueados</span></div>
          </div>
          <p className={styles.scopeNote}>{summary.realPending} controles fuera del alcance de la simulación permanecen sin certificación real. No se muestra ningún porcentaje de preparación.</p>
        </section>
        <section className={styles.panel} aria-label="Lista de casos">
          <div className={styles.panelHead}>
            <div><p className={styles.eyebrow}>PLAN DE PRUEBAS</p><h2>Casos de aceptación</h2></div>
          </div>
          <div className={styles.filters}>
            <label>Ambiente
              <select value={scopeFilter} onChange={event => setScopeFilter(event.target.value)}>
                <option value="todos">Todos</option>
                <option value="fixture">Simulación local</option>
                <option value="staging">Staging pendiente</option>
                <option value="integracion">Integraciones</option>
              </select>
            </label>
            <label>Estado
              <select value={filter} onChange={event => setFilter(event.target.value)}>
                <option value="todos">Todos</option>
                <option value="pendiente">Pendiente</option>
                <option value="bloqueada">Bloqueada</option>
                <option value="fallida">Fallida</option>
                <option value="aprobada">Aprobada · fixture</option>
              </select>
            </label>
          </div>
          <div className={styles.cases}>
            {visible.map(item => {
              const currentStatus = records[item.id]?.status ?? "pendiente";
              return <button key={item.id} type="button"
                aria-pressed={selectedId === item.id}
                className={selectedId === item.id ? styles.caseActive : styles.case}
                onClick={() => selectCase(item)}>
                <span className={styles.caseTop}><b>{item.id} · {item.group}</b><small className={styles.state} data-state={currentStatus}>{statusLabel[currentStatus]}</small></span>
                <strong>{item.title}</strong><small>{scopeLabel[item.scope]}</small>
              </button>;
            })}
            {!visible.length && <p>No hay casos con este filtro.</p>}
          </div>
        </section>
        <section className={styles.panel} aria-label="Registro de evidencias">
          <div className={styles.panelHead}>
            <div><p className={styles.eyebrow}>REGISTRO DE RESULTADOS</p><h2>{selected.id} · {selected.title}</h2></div>
            <span className={styles.scopeBadge}>{scopeLabel[selected.scope]}</span>
          </div>
          <p className={styles.objective}>{selected.objective}</p>
          {selected.suite && <p className={styles.source}>Prueba existente: <a target="_blank" rel="noopener noreferrer" href={"https://github.com/angelberiguete-pixel/crm/blob/main/" + selected.suite}>{selected.suite} ↗</a></p>}
          {selected.path && <p className={styles.source}>Ruta de referencia (no se abre desde QA): <code>{selected.path}</code></p>}
          {selected.scope !== "fixture" && <div className={styles.blocker}><strong>No certificable todavía</strong><p>Primero se requiere una aplicación de prueba con Supabase distinto al principal. El modo actual no habilita esta acción ni conexiones de proveedores.</p></div>}
          <form onSubmit={save} className={styles.form}>
            <label>Resultado
              <select value={form.status} onChange={event => change("status", event.target.value as QAStatus)}>
                <option value="pendiente">Pendiente</option>
                <option value="bloqueada">Bloqueada · motivo requerido</option>
                <option value="fallida">Fallida · motivo requerido</option>
                <option value="aprobada" disabled={selected.scope !== "fixture"}>Aprobada en fixtures · evidencia requerida</option>
              </select>
            </label>
            <div className={styles.two}>
              <label>Responsable<input maxLength={100} value={form.operator} onChange={event => change("operator", event.target.value)} placeholder="Persona que verificó" /></label>
              <label>Dispositivo / viewport<input maxLength={100} value={form.device} onChange={event => change("device", event.target.value)} placeholder="Android · 390×844" /></label>
            </div>
            <label>SHA del commit probado<input maxLength={40} spellCheck={false} value={form.commitSha} onChange={event => change("commitSha", event.target.value)} placeholder="Git commit (no inventar)" /></label>
            <label>Resultado observado / motivo<textarea maxLength={2000} rows={4} value={form.observation} onChange={event => change("observation", event.target.value)} placeholder="Describe pasos, esperado y observado; no escribas datos personales." /></label>
            <label>URL de evidencia verificable<input maxLength={500} type="url" value={form.evidenceUrl} onChange={event => change("evidenceUrl", event.target.value)} placeholder="https://github.com/.../actions/runs/..." /></label>
            <small className={styles.hint}>En caso de aprobar un fixture: requiere responsable, SHA real, dispositivo, descripción y URL HTTPS sin parámetros. No adjuntes tokens, contraseñas, datos de clientes o fotos identificables.</small>
            <button className={styles.save} type="submit">Guardar resultado local</button>
            {records[selected.id]?.checkedAt && <small className={styles.hint}>Último registro: {new Date(records[selected.id].checkedAt).toLocaleString("es-DO")}</small>}
            {notice && <p className={styles.notice} role="status">{notice}</p>}
          </form>
        </section>
        <footer className={styles.footer}>
          <strong>Límites del laboratorio</strong>
          <p>Sin producción • sin Family Power • sin envíos externos • sin cobros • sin migraciones • sin datos reales. Los cambios quedan en el almacenamiento local de este navegador y se pueden exportar como JSON. La aprobación final de la issue #69 requiere una auditoría real adicional.</p>
        </footer>
      </div>
    </main>
  );
}
