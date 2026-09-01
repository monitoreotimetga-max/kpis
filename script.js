// ================================================================
// 1. TUS TRES ENLACES PÚBLICOS (CSV)
// ================================================================
const URLS = {
    reportes: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQeIzvIMa5kwKPSuDAg38weS2PFzkgJSzy3jYUu32bktnm5HZs3woNN_dPXJwqPHQAQyBsw1155Ciem/pub?output=csv',
    alertas:  'https://docs.google.com/spreadsheets/d/e/2PACX-1vT0j08XLO5JJa6HZ6uTditfvQb_y20_7mGTOTb9rN2eNby67aCr4vrQ95ICDnamauDv8jR5nI7YTSNS/pub?output=csv',
    viajes:   'https://docs.google.com/spreadsheets/d/e/2PACX-1vTb22Taj3v6q8ZlsPWay-6Scavi1AiHKcwN7UuiAOHJ-ip0aSIpX-N4KRH0zAL5sSouG13p4ui5vjeL/pub?output=csv'
};

// ================================================================
// 2. VARIABLES GLOBALES PARA GRÁFICOS (para poder actualizarlos)
// ================================================================
let chartInfracciones = null;
let chartViajes = null;

// ================================================================
// 3. FUNCIÓN: CSV → ARRAY DE OBJETOS
// ================================================================
function csvToJson(csvTexto) {
    const lineas = csvTexto.split('\n').filter(linea => linea.trim() !== '');
    if (lineas.length < 2) return [];

    const encabezados = lineas[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const resultados = [];

    for (let i = 1; i < lineas.length; i++) {
        // Maneja campos que puedan tener comas internas (entre comillas)
        const valores = [];
        let campoActual = '';
        let dentroComillas = false;
        for (const char of lineas[i]) {
            if (char === '"') {
                dentroComillas = !dentroComillas;
            } else if (char === ',' && !dentroComillas) {
                valores.push(campoActual.trim());
                campoActual = '';
            } else {
                campoActual += char;
            }
        }
        valores.push(campoActual.trim());

        const obj = {};
        encabezados.forEach((key, idx) => {
            obj[key] = valores[idx] ? valores[idx].replace(/^"|"$/g, '') : '';
        });
        resultados.push(obj);
    }
    return resultados;
}

// ================================================================
// 4. FUNCIÓN: CARGAR TODOS LOS DATOS
// ================================================================
async function cargarDatos() {
    try {
        // Descargar los tres CSV en paralelo
        const [respReportes, respAlertas, respViajes] = await Promise.all([
            fetch(URLS.reportes),
            fetch(URLS.alertas),
            fetch(URLS.viajes)
        ]);

        if (!respReportes.ok || !respAlertas.ok || !respViajes.ok) {
            throw new Error('Error al descargar uno de los CSVs');
        }

        const [csvReportes, csvAlertas, csvViajes] = await Promise.all([
            respReportes.text(),
            respAlertas.text(),
            respViajes.text()
        ]);

        // Convertir a JSON
        const datosReportes = csvToJson(csvReportes);
        const datosAlertas = csvToJson(csvAlertas);
        const datosViajes = csvToJson(csvViajes);

        // Actualizar el dashboard
        actualizarDashboard(datosReportes, datosAlertas, datosViajes);

        // Actualizar timestamp
        document.getElementById('ultimaActualizacion').textContent =
            new Date().toLocaleTimeString('es-MX', { hour12: false });

    } catch (error) {
        console.error('Error cargando datos:', error);
        document.getElementById('ultimaActualizacion').textContent = '⚠️ Error';
    }
}

// ================================================================
// 5. FUNCIÓN: ACTUALIZAR DASHBOARD
// ================================================================
function actualizarDashboard(reportes, alertas, viajes) {
    // ---- 5a. KPI: Incidentes Totales ----
    const totalIncidentes = reportes.reduce((sum, r) => sum + Number(r['Record Count'] || 0), 0);
    document.getElementById('totalIncidentes').textContent = totalIncidentes || 0;

    // ---- 5b. KPI: Viajes Totales ----
    const totalViajes = viajes.reduce((sum, v) => sum + Number(v['Record Count'] || 0), 0);
    document.getElementById('totalViajes').textContent = totalViajes || 0;

    // ---- 5c. KPI: % Incidencias / Viajes ----
    const porcentaje = totalViajes > 0 ? ((totalIncidentes / totalViajes) * 100).toFixed(2) : 0;
    document.getElementById('porcentajeIncidencias').textContent = porcentaje + '%';

    // ---- 5d. Tabla: Top 10 Infractores ----
    const cuerpo = document.getElementById('cuerpoInfractores');
    cuerpo.innerHTML = '';
    // Ordenar por Record Count (asumiendo que es el total de infracciones)
    const top10 = [...reportes]
        .sort((a, b) => Number(b['Record Count'] || 0) - Number(a['Record Count'] || 0))
        .slice(0, 10);

    top10.forEach(infractor => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${infractor['Nombre'] || infractor['nombre'] || 'N/A'}</td>
            <td>${infractor['Exceso de velocidad'] || 0}</td>
            <td>${infractor['Detencion no autorizada'] || 0}</td>
            <td>${infractor['No usar cinturón de seguri…'] || infractor['No usar cinturón de seguridad'] || 0}</td>
            <td>${infractor['Negarse a validacion EPP'] || 0}</td>
            <td>${infractor['Circulando fuera de horario…'] || infractor['Circulando fuera de horario permitido'] || 0}</td>
            <td>${infractor['Incumplimiento de políticas…'] || infractor['Incumplimiento de políticas de seguri…'] || 0}</td>
        `;
        cuerpo.appendChild(tr);
    });

    // ---- 5e. Gráfico: Infracciones por Tipo ----
    const categorias = ['Exceso de velocidad', 'Detencion no autorizada', 'No usar cinturón de seguridad',
        'Negarse a validacion EPP', 'Circulando fuera de horario permitido', 'Incumplimiento de políticas de seguridad'
    ];
    const valores = categorias.map(cat => {
        return reportes.reduce((sum, r) => sum + Number(r[cat] || 0), 0);
    });

    const ctx1 = document.getElementById('chartInfracciones').getContext('2d');
    if (chartInfracciones) chartInfracciones.destroy();
    chartInfracciones = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: categorias.map(c => c.replace(' de seguridad', '').replace(' permitido', '').substring(0, 20)),
            datasets: [{
                label: 'Total de infracciones',
                data: valores,
                backgroundColor: ['#ff6384', '#36a2eb', '#ffce56', '#4bc0c0', '#9966ff', '#ff9f40'],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });

    // ---- 5f. Tabla: Alertas GPS ----
    const cuerpoAlertas = document.getElementById('cuerpoAlertas');
    cuerpoAlertas.innerHTML = '';
    alertas.forEach(alerta => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${alerta['Nombre de notificación'] || alerta['nombre'] || 'N/A'}</td>
            <td>${alerta['Record Count'] || 0}</td>
        `;
        cuerpoAlertas.appendChild(tr);
    });

    // ---- 5g. Viajes por Razón Social ----
    const metga = viajes.find(v => v['Razon Social']?.toLowerCase().includes('metga')) || {};
    const teson = viajes.find(v => v['Razon Social']?.toLowerCase().includes('teson')) || {};
    const viajesMetga = Number(metga['Record Count'] || 0);
    const viajesTesón = Number(teson['Record Count'] || 0);
    document.getElementById('viajesMetga').textContent = viajesMetga;
    document.getElementById('viajesTeson').textContent = viajesTesón;

    const totalViajes2 = viajesMetga + viajesTesón;
    const incidenciasPorViaje = totalViajes2 > 0 ? ((totalIncidentes / totalViajes2) * 100).toFixed(2) : 0;
    document.getElementById('incidenciasPorViaje').textContent = incidenciasPorViaje + '%';

    // ---- 5h. Gráfico: Viajes (dona) ----
    const ctx2 = document.getElementById('chartViajes').getContext('2d');
    if (chartViajes) chartViajes.destroy();
    chartViajes = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: ['METGA', 'TESON'],
            datasets: [{
                data: [viajesMetga, viajesTesón],
                backgroundColor: ['#36a2eb', '#ff6384'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

// ================================================================
// 6. EJECUTAR: Carga inicial + actualización cada 60 segundos
// ================================================================
cargarDatos();
setInterval(cargarDatos, 60000); // cada 60 segundos
