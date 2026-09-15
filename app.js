// ============================================
// CONFIGURACIÓN
// ============================================
const BASE_URL = "./data";

// ============================================
// ESTADO GLOBAL
// ============================================
const state = {
  viajes: [],
  reportes: [],
  alertas: [],
  alertasIndex: {},
  filtros: { razon: "todas", mes: "todos", operador: "todos", unidad: "todas" },
  tabActivo: "dashboard",
  tablaActiva: "reportes",
  charts: {},
  tabla: { pagina: 1, porPagina: 50, orden: { campo: null, asc: true }, filtroTexto: "" },
};

const COLORS = ["#3b82f6","#ef4444","#f59e0b","#10b981","#8b5cf6","#ec4899","#06b6d4","#f97316","#84cc16","#6366f1","#14b8a6","#eab308"];
const MESES_ORDEN = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const VEL_MAX_VALIDA = 140; // km/h - arriba de esto son outliers del GPS

// ============================================
// REGISTRAR PLUGIN DE ETIQUETAS
// ============================================
if (typeof ChartDataLabels !== "undefined") {
  Chart.register(ChartDataLabels);
}
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.plugins.datalabels = {
  color: "#1e293b",
  font: { weight: "600", size: 10 },
  anchor: "end",
  align: "end",
  formatter: (value) => {
    if (value === 0 || value === null || value === undefined) return "";
    if (typeof value === "number" && value > 999) return (value / 1000).toFixed(1) + "k";
    return value;
  }
};

// ============================================
// UTILIDADES
// ============================================
function getRazonAlerta(unidadCorta) {
  if (!unidadCorta) return "N/A";
  return unidadCorta.startsWith("TR-") ? "METGA" : "TESON";
}

function mesNumeroANombre(fechaISO) {
  if (!fechaISO) return null;
  const mes = parseInt(fechaISO.slice(5, 7));
  return MESES_ORDEN[mes - 1];
}

function setEstado(txt, clase) {
  const el = document.getElementById("estado-carga");
  el.textContent = txt;
  el.className = "text-xs " + clase;
}

// ============================================
// CARGA DE DATOS
// ============================================
async function cargarDatos() {
  try {
    setEstado("Cargando viajes y reportes...", "text-yellow-400");

    const [viajes, reportes, alertasIndex] = await Promise.all([
      fetch(`${BASE_URL}/viajes.json`).then(r => r.json()),
      fetch(`${BASE_URL}/reportes.json`).then(r => r.json()),
      fetch(`${BASE_URL}/alertas_index.json`).then(r => r.json()),
    ]);

    state.viajes = viajes;
    state.reportes = reportes;
    state.alertasIndex = alertasIndex;

    llenarFiltros();
    renderizarTodo();

    setEstado("Cargando alertas GPS...", "text-yellow-400");
    document.getElementById("progreso").classList.remove("hidden");

    const meses = Object.keys(alertasIndex).sort();
    let alertasAcumuladas = [];

    for (let i = 0; i < meses.length; i++) {
      const mes = meses[i];
      const url = `${BASE_URL}/${alertasIndex[mes].archivo}`;
      const dataMes = await fetch(url).then(r => r.json());
      alertasAcumuladas = alertasAcumuladas.concat(dataMes);
      state.alertas = alertasAcumuladas;

      const pct = ((i + 1) / meses.length * 100).toFixed(0);
      document.getElementById("progreso-bar").style.width = pct + "%";
      document.getElementById("progreso-texto").textContent =
        `Cargando alertas GPS: ${i + 1}/${meses.length} meses (${alertasAcumuladas.length.toLocaleString()} alertas)`;
    }

    renderizarTodo();

    document.getElementById("progreso").classList.add("hidden");
    setEstado(`✓ Datos cargados (${state.viajes.length.toLocaleString()} viajes · ${state.reportes.length} reportes · ${state.alertas.length.toLocaleString()} alertas)`, "text-green-400");

  } catch (e) {
    console.error(e);
    setEstado("Error: " + e.message, "text-red-400");
  }
}

// ============================================
// LLENAR FILTROS
// ============================================
function llenarFiltros() {
  const razones = ["METGA", "TESON"];
  const meses = [...new Set(state.viajes.map(v => v.mes).filter(Boolean))];
  const operadores = [...new Set(state.reportes.map(r => r.operador).filter(Boolean))].sort();
  const unidades = [...new Set([
    ...state.reportes.map(r => r.unidad).filter(Boolean),
    ...state.viajes.map(v => v.unidad).filter(Boolean),
  ])].sort();

  meses.sort((a,b) => MESES_ORDEN.indexOf(a) - MESES_ORDEN.indexOf(b));

  llenarSelect("filtro-razon", razones, "Todas");
  llenarSelect("filtro-mes", meses, "Todos");
  llenarSelect("filtro-operador", operadores, "Todos");
  llenarSelect("filtro-unidad", unidades, "Todas");
}

function llenarSelect(id, opciones, placeholder) {
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="${placeholder.toLowerCase()}">${placeholder}</option>` +
    opciones.map(o => `<option value="${o}">${o}</option>`).join("");
}

// ============================================
// FILTRAR DATOS
// ============================================
function aplicarFiltros() {
  const f = state.filtros;

  const viajesF = state.viajes.filter(v => {
    if (f.razon !== "todas" && v.razon_social !== f.razon) return false;
    if (f.mes !== "todos" && v.mes !== f.mes) return false;
    if (f.operador !== "todos" && v.operador !== f.operador) return false;
    if (f.unidad !== "todas" && v.unidad !== f.unidad) return false;
    return true;
  });

  const reportesF = state.reportes.filter(r => {
    if (f.razon !== "todas" && r.razon_social !== f.razon) return false;
    if (f.mes !== "todos" && r.mes !== f.mes) return false;
    if (f.operador !== "todos" && r.operador !== f.operador) return false;
    if (f.unidad !== "todas" && r.unidad !== f.unidad) return false;
    return true;
  });

  const alertasF = state.alertas.filter(a => {
    if (f.razon !== "todas" && getRazonAlerta(a.unidad_corta) !== f.razon) return false;
    if (f.mes !== "todos") {
      const nombreMes = mesNumeroANombre(a.fecha);
      if (nombreMes !== f.mes) return false;
    }
    if (f.unidad !== "todas" && a.unidad_corta !== f.unidad) return false;
    // Filtrar outliers de velocidad en el filtrado base
    if (a.velocidad_kmh && a.velocidad_kmh > VEL_MAX_VALIDA) return false;
    return true;
  });

  return { viajes: viajesF, reportes: reportesF, alertas: alertasF };
}

// ============================================
// RENDERIZAR
// ============================================
function renderizarTodo() {
  const f = aplicarFiltros();
  renderKPIs(f);
  renderGraficos(f);
  if (state.tabActivo === "incidencias") renderTabla();
}

// ============================================
// KPIs
// ============================================
function renderKPIs(f) {
  const totalViajes = f.viajes.length;
  const incidentes = f.reportes.length;
  const alertas = f.alertas.length;

  document.getElementById("kpi-viajes").textContent = totalViajes.toLocaleString();
  document.getElementById("kpi-reportes").textContent = incidentes.toLocaleString();
  document.getElementById("kpi-alertas").textContent = alertas.toLocaleString();

  const tasa = totalViajes > 0 ? (incidentes / totalViajes * 100).toFixed(2) : "0.00";
  document.getElementById("kpi-tasa").textContent = tasa + "%";

  const conversion = alertas > 0 ? (incidentes / alertas * 100).toFixed(3) : "0.00";
  document.getElementById("kpi-conversion").textContent = conversion + "%";

  // Top razón por tasa
  const porRazon = {};
  f.viajes.forEach(v => {
    const rs = v.razon_social || "N/A";
    porRazon[rs] = porRazon[rs] || { viajes: 0, incidentes: 0 };
    porRazon[rs].viajes++;
  });
  f.reportes.forEach(r => {
    const rs = r.razon_social || "N/A";
    porRazon[rs] = porRazon[rs] || { viajes: 0, incidentes: 0 };
    porRazon[rs].incidentes++;
  });
  let topRazon = "N/A", topTasa = 0;
  Object.entries(porRazon).forEach(([rs, d]) => {
    const t = d.viajes > 0 ? d.incidentes / d.viajes : 0;
    if (t > topTasa) { topTasa = t; topRazon = rs; }
  });
  document.getElementById("kpi-top-razon").textContent = `${topRazon} (${(topTasa*100).toFixed(1)}%)`;

  // Velocidad máxima (filtrando < VEL_MAX_VALIDA)
  const velocidades = f.alertas.map(a => a.velocidad_kmh || 0).filter(v => v > 0 && v <= VEL_MAX_VALIDA);
  const velMax = velocidades.length > 0 ? Math.max(...velocidades) : 0;
  document.getElementById("kpi-vel-max").textContent = velMax.toLocaleString();

  const inc100 = totalViajes > 0 ? (incidentes / totalViajes * 100).toFixed(1) : "0";
  document.getElementById("kpi-inc-100").textContent = inc100;
}

// ============================================
// GRÁFICOS
// ============================================
function destruirChart(id) {
  if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; }
}

function crearChart(id, config) {
  destruirChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  state.charts[id] = new Chart(ctx, config);
}

function renderGraficos(f) {
  // ---------- 1. Incidentes por Mes ----------
  const incMes = {};
  f.reportes.forEach(r => { if (r.mes) incMes[r.mes] = (incMes[r.mes] || 0) + 1; });
  const mesesConDatos = MESES_ORDEN.filter(m => incMes[m]);
  crearChart("chart-inc-mes", {
    type: "bar",
    data: {
      labels: mesesConDatos,
      datasets: [{ label: "Incidentes", data: mesesConDatos.map(m => incMes[m]), backgroundColor: "#ef4444", borderRadius: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  // ---------- 2. Tipos de Incidente ----------
  const tipos = {};
  f.reportes.forEach(r => { if (r.tipo_reporte) tipos[r.tipo_reporte] = (tipos[r.tipo_reporte] || 0) + 1; });
  const tiposOrden = Object.entries(tipos).sort((a,b) => b[1] - a[1]);
  crearChart("chart-tipos", {
    type: "doughnut",
    data: {
      labels: tiposOrden.map(t => t[0]),
      datasets: [{ data: tiposOrden.map(t => t[1]), backgroundColor: COLORS }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { font: { size: 10 } } }, datalabels: { display: false } } }
  });

  // ---------- 3. Incidentes por Unidad ----------
  const incUnidad = {};
  f.reportes.forEach(r => { if (r.unidad) incUnidad[r.unidad] = (incUnidad[r.unidad] || 0) + 1; });
  const topUnidad = Object.entries(incUnidad).sort((a,b) => b[1] - a[1]).slice(0, 10);
  crearChart("chart-inc-unidad", {
    type: "bar",
    data: {
      labels: topUnidad.map(u => u[0]),
      datasets: [{ label: "Incidentes", data: topUnidad.map(u => u[1]), backgroundColor: "#3b82f6", borderRadius: 4 }]
    },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  // ---------- 4. Top 10 Infractores (stacked por tipo) ----------
  const porOperadorTipos = {};
  f.reportes.forEach(r => {
    const op = r.operador || "N/A";
    if (!porOperadorTipos[op]) porOperadorTipos[op] = {};
    porOperadorTipos[op][r.tipo_reporte || "Otro"] = (porOperadorTipos[op][r.tipo_reporte || "Otro"] || 0) + 1;
  });
  const top10Ops = Object.entries(porOperadorTipos)
    .map(([op, tipos]) => [op, Object.values(tipos).reduce((a,b) => a+b, 0), tipos])
    .sort((a,b) => b[1] - a[1])
    .slice(0, 10);

  const todosTipos = [...new Set(f.reportes.map(r => r.tipo_reporte).filter(Boolean))];
  const datasetsStacked = todosTipos.map((tipo, i) => ({
    label: tipo,
    data: top10Ops.map(([_, __, tipos]) => tipos[tipo] || 0),
    backgroundColor: COLORS[i % COLORS.length],
  }));

  crearChart("chart-infractores", {
    type: "bar",
    data: { labels: top10Ops.map(o => o[0].substring(0, 25)), datasets: datasetsStacked },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true } },
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 9 } } },
        datalabels: { display: false }
      }
    }
  });

  // ---------- 5. NUEVO: Top 10 Infractores de Exceso de Velocidad (Reportes) ----------
  const infractoresVel = {};
  f.reportes.forEach(r => {
    if ((r.tipo_reporte || "").toLowerCase().includes("exceso de velocidad")) {
      const op = r.operador || "N/A";
      infractoresVel[op] = (infractoresVel[op] || 0) + 1;
    }
  });
  const topInfractoresVel = Object.entries(infractoresVel).sort((a,b) => b[1] - a[1]).slice(0, 10);
  crearChart("chart-infractores-vel", {
    type: "bar",
    data: {
      labels: topInfractoresVel.map(o => o[0].substring(0, 30)),
      datasets: [{
        label: "Reportes de exceso",
        data: topInfractoresVel.map(o => o[1]),
        backgroundColor: "#dc2626",
        borderRadius: 4
      }]
    },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  // ---------- 6. Top 10 Operadores por Total ----------
  const incOp = {};
  f.reportes.forEach(r => { if (r.operador) incOp[r.operador] = (incOp[r.operador] || 0) + 1; });
  const topOpTotal = Object.entries(incOp).sort((a,b) => b[1] - a[1]).slice(0, 10);
  crearChart("chart-op-total", {
    type: "bar",
    data: {
      labels: topOpTotal.map(o => o[0].substring(0, 22)),
      datasets: [{ label: "Incidentes", data: topOpTotal.map(o => o[1]), backgroundColor: "#8b5cf6", borderRadius: 4 }]
    },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  // ---------- 7. Top 10 Operadores por Tasa ----------
  const viajesPorOp = {};
  f.viajes.forEach(v => { if (v.operador) viajesPorOp[v.operador] = (viajesPorOp[v.operador] || 0) + 1; });
  const tasaOp = Object.entries(incOp).map(([op, inc]) => {
    const via = viajesPorOp[op] || 0;
    return [op, via > 0 ? (inc / via * 100) : 0, inc, via];
  }).filter(o => o[3] >= 5).sort((a,b) => b[1] - a[1]).slice(0, 10);

  crearChart("chart-op-tasa", {
    type: "bar",
    data: {
      labels: tasaOp.map(o => o[0].substring(0, 22)),
      datasets: [{ label: "Tasa %", data: tasaOp.map(o => parseFloat(o[1].toFixed(2))), backgroundColor: "#ec4899", borderRadius: 4 }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { afterLabel: (ctx) => `Incidentes: ${tasaOp[ctx.dataIndex][2]} / Viajes: ${tasaOp[ctx.dataIndex][3]}` } }
      }
    }
  });

  // ---------- 8. Distribución Viajes por Razón Social ----------
  const viajesRS = {};
  f.viajes.forEach(v => { const rs = v.razon_social || "N/A"; viajesRS[rs] = (viajesRS[rs] || 0) + 1; });
  crearChart("chart-viajes-rs", {
    type: "doughnut",
    data: {
      labels: Object.keys(viajesRS),
      datasets: [{ data: Object.values(viajesRS), backgroundColor: ["#3b82f6", "#f59e0b", "#10b981", "#ef4444"] }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" }, datalabels: { display: false } } }
  });

  // ---------- 9. Viajes por Mes ----------
  const viajesMes = {};
  f.viajes.forEach(v => { if (v.mes) viajesMes[v.mes] = (viajesMes[v.mes] || 0) + 1; });
  const mesesViajes = MESES_ORDEN.filter(m => viajesMes[m]);
  crearChart("chart-viajes-mes", {
    type: "line",
    data: {
      labels: mesesViajes,
      datasets: [{
        label: "Viajes",
        data: mesesViajes.map(m => viajesMes[m]),
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.1)",
        fill: true,
        tension: 0.4
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  // ---------- 10. Tasa Incidentes por Razón Social ----------
  const razonesRS = Object.keys(viajesRS);
  const tasaRS = razonesRS.map(rs => {
    const via = viajesRS[rs];
    const inc = f.reportes.filter(r => r.razon_social === rs).length;
    return via > 0 ? (inc / via * 100) : 0;
  });
  crearChart("chart-tasa-rs", {
    type: "bar",
    data: {
      labels: razonesRS,
      datasets: [{ label: "Tasa %", data: tasaRS.map(t => parseFloat(t.toFixed(2))), backgroundColor: "#10b981", borderRadius: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  // ---------- 11. Alertas por Tipo ----------
  const alertasTipo = {};
  f.alertas.forEach(a => {
    const t = a.tipo_alerta_normalizado || a.tipo_alerta || "Otro";
    alertasTipo[t] = (alertasTipo[t] || 0) + 1;
  });
  const alertasTipoOrden = Object.entries(alertasTipo).sort((a,b) => b[1] - a[1]).slice(0, 10);
  crearChart("chart-alertas-tipo", {
    type: "doughnut",
    data: {
      labels: alertasTipoOrden.map(t => t[0]),
      datasets: [{ data: alertasTipoOrden.map(t => t[1]), backgroundColor: COLORS }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { font: { size: 10 } } }, datalabels: { display: false } } }
  });

  // ---------- 12. Top 10 Unidades con más Alertas ----------
  const alertasUnidad = {};
  f.alertas.forEach(a => { const u = a.unidad_corta || "N/A"; alertasUnidad[u] = (alertasUnidad[u] || 0) + 1; });
  const topAlertasUnidad = Object.entries(alertasUnidad).sort((a,b) => b[1] - a[1]).slice(0, 10);
  crearChart("chart-alertas-unidad", {
    type: "bar",
    data: {
      labels: topAlertasUnidad.map(u => u[0]),
      datasets: [{ label: "Alertas", data: topAlertasUnidad.map(u => u[1]), backgroundColor: "#f59e0b", borderRadius: 4 }]
    },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  // ---------- 13. Alertas por Mes ----------
  const alertasMes = {};
  f.alertas.forEach(a => { const m = mesNumeroANombre(a.fecha); if (m) alertasMes[m] = (alertasMes[m] || 0) + 1; });
  const mesesAlertas = MESES_ORDEN.filter(m => alertasMes[m]);
  crearChart("chart-alertas-mes", {
    type: "line",
    data: {
      labels: mesesAlertas,
      datasets: [{
        label: "Alertas",
        data: mesesAlertas.map(m => alertasMes[m]),
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245,158,11,0.15)",
        fill: true,
        tension: 0.4
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  // ---------- 14. Distribución de Velocidad (Excesos) ----------
  const excesos = f.alertas.filter(a => (a.tipo_alerta_normalizado || "").includes("exceso_velocidad") && a.velocidad_kmh > 0);
  const rangos = { "85-95": 0, "95-105": 0, "105-115": 0, "115-125": 0, "125-140": 0 };
  excesos.forEach(a => {
    const v = a.velocidad_kmh;
    if (v < 95) rangos["85-95"]++;
    else if (v < 105) rangos["95-105"]++;
    else if (v < 115) rangos["105-115"]++;
    else if (v < 125) rangos["115-125"]++;
    else rangos["125-140"]++;
  });
  crearChart("chart-vel-hist", {
    type: "bar",
    data: {
      labels: Object.keys(rangos),
      datasets: [{ label: "Alertas", data: Object.values(rangos), backgroundColor: "#ef4444", borderRadius: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  // ---------- 15. NUEVO: Top 10 Velocidades Máximas por Unidad (< 140) ----------
  const velMaxUnidad = {};
  f.alertas.forEach(a => {
    if (!a.unidad_corta || !a.velocidad_kmh) return;
    if (a.velocidad_kmh > VEL_MAX_VALIDA) return;
    const u = a.unidad_corta;
    if (!velMaxUnidad[u] || a.velocidad_kmh > velMaxUnidad[u]) {
      velMaxUnidad[u] = a.velocidad_kmh;
    }
  });
  const topVelMax = Object.entries(velMaxUnidad).sort((a,b) => b[1] - a[1]).slice(0, 10);
  crearChart("chart-vel-max-unidad", {
    type: "bar",
    data: {
      labels: topVelMax.map(u => u[0]),
      datasets: [{
        label: "Velocidad Máx (km/h)",
        data: topVelMax.map(u => u[1]),
        backgroundColor: "#dc2626",
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { max: VEL_MAX_VALIDA } },
      plugins: {
        legend: { display: false },
        datalabels: { anchor: "end", align: "right", color: "#fff" }
      }
    }
  });

  // ---------- 16. NUEVO: Top 10 Unidades con más Excesos Registrados ----------
  const excesosUnidad = {};
  f.alertas.forEach(a => {
    if ((a.tipo_alerta_normalizado || "").includes("exceso_velocidad")) {
      const u = a.unidad_corta || "N/A";
      excesosUnidad[u] = (excesosUnidad[u] || 0) + 1;
    }
  });
  const topExcesosUnidad = Object.entries(excesosUnidad).sort((a,b) => b[1] - a[1]).slice(0, 10);
  crearChart("chart-excesos-unidad", {
    type: "bar",
    data: {
      labels: topExcesosUnidad.map(u => u[0]),
      datasets: [{
        label: "Excesos registrados",
        data: topExcesosUnidad.map(u => u[1]),
        backgroundColor: "#f97316",
        borderRadius: 4
      }]
    },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  // ---------- 17. Cumplimiento de Políticas ----------
  const tiposCumplimiento = [
    "No usar cinturón de seguridad",
    "Negarse a validacion EPP",
    "Fumar dentro de unidad",
    "Exceso de velocidad",
  ];
  const cumplimiento = {};
  tiposCumplimiento.forEach(t => {
    cumplimiento[t] = f.reportes.filter(r => (r.tipo_reporte || "").toLowerCase().includes(t.toLowerCase().substring(0, 12))).length;
  });
  const cumplimientoNoCero = Object.entries(cumplimiento).filter(c => c[1] > 0);
  crearChart("chart-cumplimiento", {
    type: "bar",
    data: {
      labels: cumplimientoNoCero.map(c => c[0]),
      datasets: [{ label: "Incidentes", data: cumplimientoNoCero.map(c => c[1]), backgroundColor: "#06b6d4", borderRadius: 4 }]
    },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  // ---------- 18. Top 10 Reincidentes en Cumplimiento ----------
  const cumplimientoOp = {};
  f.reportes.forEach(r => {
    const t = (r.tipo_reporte || "").toLowerCase();
    if (tiposCumplimiento.some(tc => t.includes(tc.toLowerCase().substring(0, 12)))) {
      const op = r.operador || "N/A";
      cumplimientoOp[op] = (cumplimientoOp[op] || 0) + 1;
    }
  });
  const topCumpl = Object.entries(cumplimientoOp).sort((a,b) => b[1] - a[1]).slice(0, 10);
  crearChart("chart-cumpl-op", {
    type: "bar",
    data: {
      labels: topCumpl.map(o => o[0].substring(0, 22)),
      datasets: [{ label: "Incidentes de cumplimiento", data: topCumpl.map(o => o[1]), backgroundColor: "#10b981", borderRadius: 4 }]
    },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });
}

// ============================================
// TABLA INCIDENCIAS
// ============================================
function renderTabla() {
  const t = state.tablaActiva;
  let datos = [];
  let columnas = [];

  if (t === "reportes") {
    datos = state.reportes;
    columnas = ["fecha_incidente","unidad","operador","tipo_reporte","estado","municipio","razon_social","hora"];
  } else if (t === "alertas") {
    datos = state.alertas.filter(a => !a.velocidad_kmh || a.velocidad_kmh <= VEL_MAX_VALIDA);
    columnas = ["fecha_hora","unidad_corta","tipo_alerta","velocidad_kmh","ubicacion","es_duplicado_config"];
  } else if (t === "viajes") {
    datos = state.viajes;
    columnas = ["fecha_inicio","no_viaje","unidad","operador","origen","destino","litros","cliente","razon_social"];
  }

  if (state.tabla.filtroTexto) {
    const q = state.tabla.filtroTexto.toLowerCase();
    datos = datos.filter(d => columnas.some(c => String(d[c] || "").toLowerCase().includes(q)));
  }

  if (state.tabla.orden.campo) {
    const campo = state.tabla.orden.campo;
    const asc = state.tabla.orden.asc;
    datos = [...datos].sort((a, b) => {
      const va = a[campo], vb = b[campo];
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return asc ? va - vb : vb - va;
      return asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }

  const total = datos.length;
  const porPagina = state.tabla.porPagina;
  const totalPags = Math.ceil(total / porPagina) || 1;
  if (state.tabla.pagina > totalPags) state.tabla.pagina = totalPags;
  const inicio = (state.tabla.pagina - 1) * porPagina;
  const datosPag = datos.slice(inicio, inicio + porPagina);

  const thead = document.getElementById("tabla-header");
  thead.innerHTML = columnas.map(c => {
    const flecha = state.tabla.orden.campo === c ? (state.tabla.orden.asc ? " ▲" : " ▼") : "";
    return `<th data-campo="${c}" class="px-3 py-2 text-left text-xs">${c}${flecha}</th>`;
  }).join("");

  const tbody = document.getElementById("tabla-body");
  tbody.innerHTML = datosPag.map(d => {
    return "<tr class='border-b hover:bg-blue-50'>" + columnas.map(c => {
      let val = d[c];
      if (val === true) val = "Sí";
      else if (val === false) val = "No";
      else if (val == null) val = "—";
      else if (typeof val === "number" && !Number.isInteger(val)) val = val.toFixed(2);
      else if (typeof val === "string" && val.length > 60) val = val.substring(0, 60) + "...";
      return `<td class="px-3 py-2 text-xs">${val}</td>`;
    }).join("") + "</tr>";
  }).join("");

  document.getElementById("tabla-info").textContent =
    `Mostrando ${inicio + 1}-${Math.min(inicio + porPagina, total)} de ${total.toLocaleString()} registros`;
  document.getElementById("pag-num").textContent = `${state.tabla.pagina} / ${totalPags}`;

  thead.querySelectorAll("th").forEach(th => {
    th.onclick = () => {
      const campo = th.dataset.campo;
      if (state.tabla.orden.campo === campo) {
        state.tabla.orden.asc = !state.tabla.orden.asc;
      } else {
        state.tabla.orden.campo = campo;
        state.tabla.orden.asc = true;
      }
      renderTabla();
    };
  });
}

// ============================================
// EXPORTAR CSV
// ============================================
function exportarCSV() {
  const t = state.tablaActiva;
  let datos = t === "reportes" ? state.reportes : t === "alertas" ? state.alertas : state.viajes;
  if (!datos.length) return;

  const cols = Object.keys(datos[0]);
  const csv = [
    cols.join(","),
    ...datos.map(d => cols.map(c => {
      let v = d[c] == null ? "" : String(d[c]);
      v = v.replace(/"/g, '""');
      return `"${v}"`;
    }).join(","))
  ].join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================
// EVENTOS
// ============================================
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab-btn").forEach(b => {
      b.classList.remove("tab-active"); b.classList.add("tab-inactive");
    });
    btn.classList.remove("tab-inactive"); btn.classList.add("tab-active");

    const tab = btn.dataset.tab;
    state.tabActivo = tab;
    document.getElementById("tab-dashboard").classList.toggle("hidden", tab !== "dashboard");
    document.getElementById("tab-incidencias").classList.toggle("hidden", tab !== "incidencias");
    if (tab === "incidencias") renderTabla();
  };
});

document.querySelectorAll(".btn-tabla").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".btn-tabla").forEach(b => {
      b.classList.remove("bg-blue-600", "text-white");
      b.classList.add("bg-gray-200", "text-gray-700");
    });
    btn.classList.remove("bg-gray-200", "text-gray-700");
    btn.classList.add("bg-blue-600", "text-white");
    state.tablaActiva = btn.dataset.tabla;
    state.tabla.pagina = 1;
    state.tabla.orden = { campo: null, asc: true };
    renderTabla();
  };
});

document.getElementById("filtro-razon").onchange = e => { state.filtros.razon = e.target.value; renderizarTodo(); };
document.getElementById("filtro-mes").onchange = e => { state.filtros.mes = e.target.value; renderizarTodo(); };
document.getElementById("filtro-operador").onchange = e => { state.filtros.operador = e.target.value; renderizarTodo(); };
document.getElementById("filtro-unidad").onchange = e => { state.filtros.unidad = e.target.value; renderizarTodo(); };

document.getElementById("btn-reset").onclick = () => {
  state.filtros = { razon: "todas", mes: "todos", operador: "todos", unidad: "todas" };
  document.getElementById("filtro-razon").value = "todas";
  document.getElementById("filtro-mes").value = "todos";
  document.getElementById("filtro-operador").value = "todos";
  document.getElementById("filtro-unidad").value = "todas";
  renderizarTodo();
};

document.getElementById("busqueda").oninput = e => {
  state.tabla.filtroTexto = e.target.value;
  state.tabla.pagina = 1;
  renderTabla();
};

document.getElementById("pag-prev").onclick = () => {
  if (state.tabla.pagina > 1) { state.tabla.pagina--; renderTabla(); }
};

document.getElementById("pag-next").onclick = () => {
  state.tabla.pagina++;
  renderTabla();
};

document.getElementById("exportar-csv").onclick = exportarCSV;

// ============================================
// INICIAR
// ============================================
cargarDatos();
