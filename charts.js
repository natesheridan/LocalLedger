/* ================================
   CHART.JS CHARTS FOR LOCALLEDGER
================================= */

// Chart.js is loaded from CDN and exposed globally in index.html

/* ================================
   CHART CONFIGURATION
================================= */

// Chart color palette
const chartColors = {
  primary: '#6366f1',
  secondary: '#8b5cf6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#06b6d4',
  colors: [
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    '#f43f5e', '#f97316', '#eab308', '#84cc16', '#22c55e',
    '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1'
  ]
};

/* ================================
   DATA AGGREGATION HELPERS
================================= */

// Ensure dateFilter exists globally (defined in index.html)
if (typeof dateFilter === 'undefined') {
  dateFilter = { type: "month", startDate: null, endDate: null, label: "This Month" };
}

function getFilteredRecords() {
  const allData = loadData();
  const records = allData.records.filter(r => !r.deleted);
  return getFilteredRecordsForChart(records);
}

function getFilteredRecordsForChart(records) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  
  let startDate, endDate;
  
  // Use the same filter as history view
  if (dateFilter.type === "month") {
    startDate = new Date(currentYear, currentMonth, 1);
    endDate = new Date(currentYear, currentMonth + 1, 0);
  } else if (dateFilter.type === "ytd") {
    startDate = new Date(currentYear, 0, 1);
    endDate = today;
  } else if (dateFilter.type === "past3months") {
    startDate = new Date(currentYear, currentMonth - 3, 1);
    endDate = today;
  } else if (dateFilter.type === "range" && dateFilter.startDate && dateFilter.endDate) {
    startDate = new Date(dateFilter.startDate);
    endDate = new Date(dateFilter.endDate);
  } else {
    startDate = new Date(currentYear, currentMonth, 1);
    endDate = new Date(currentYear, currentMonth + 1, 0);
  }
  
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];
  
  return records.filter(r => r.date >= startStr && r.date <= endStr);
}

/* ================================
   PIE CHART - INCOME BY LOCATION
================================= */

function renderLocationPieChart(containerId = 'locationPieChart') {
  const records = getFilteredRecords();
  
  if (!records || records.length === 0) return;
  
  // Aggregate by location
  const locationData = {};
  records.forEach(r => {
    const hours = parseFloat(r.hours) || 0;
    const rate = parseFloat(r.rate) || 0;
    const tips = parseFloat(r.tips) || 0;
    const total = (hours * rate) + tips;
    if (total > 0) {
      locationData[r.location] = (locationData[r.location] || 0) + total;
    }
  });
  
  const sortedLocations = Object.entries(locationData)
    .sort((a, b) => b[1] - a[1]);
  
  if (sortedLocations.length === 0) return;
  
  const labels = sortedLocations.map(([loc]) => loc);
  const data = sortedLocations.map(([, total]) => total);
  
  const ctx = document.getElementById(containerId);
  if (!ctx) return;
  
  // Destroy existing chart if any
  const existingChart = Chart.getChart(ctx);
  if (existingChart) existingChart.destroy();
  
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: chartColors.colors.slice(0, labels.length),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#9ca3af',
            padding: 12,
            font: { family: "'Space Mono', monospace", size: 10 }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const value = ctx.raw;
              const totalSum = data.reduce((a, b) => a + b, 0);
              const pct = ((value / totalSum) * 100).toFixed(1);
              return `$${value.toFixed(2)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

/* ================================
   BAR CHART - TIPS VS HOURLY BY LOCATION
================================= */

function renderTipsVsHourlyBarChart(containerId = 'tipsVsHourlyChart') {
  const records = getFilteredRecords();
  
  if (!records || records.length === 0) return;
  
  // Aggregate by location
  const locationData = {};
  records.forEach(r => {
    const hours = parseFloat(r.hours) || 0;
    const rate = parseFloat(r.rate) || 0;
    const tips = parseFloat(r.tips) || 0;
    if (!locationData[r.location]) {
      locationData[r.location] = { hourly: 0, tips: 0 };
    }
    locationData[r.location].hourly += (hours * rate);
    locationData[r.location].tips += tips;
  });
  
  // Sort by total income
  const sortedLocations = Object.entries(locationData)
    .sort((a, b) => (b[1].hourly + b[1].tips) - (a[1].hourly + a[1].tips))
    .slice(0, 8); // Top 8 locations
  
  if (sortedLocations.length === 0) return;
  
  const labels = sortedLocations.map(([loc]) => loc);
  const hourlyData = sortedLocations.map(([, d]) => d.hourly);
  const tipsData = sortedLocations.map(([, d]) => d.tips);
  
  const ctx = document.getElementById(containerId);
  if (!ctx) return;
  
  const existingChart = Chart.getChart(ctx);
  if (existingChart) existingChart.destroy();
  
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Hourly',
          data: hourlyData,
          backgroundColor: chartColors.primary,
          borderRadius: 4
        },
        {
          label: 'Tips',
          data: tipsData,
          backgroundColor: chartColors.success,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: {
          stacked: true,
          grid: { color: '#374151' },
          ticks: { color: '#9ca3af', callback: v => '$' + v }
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: { color: '#9ca3af', font: { size: 10 } }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#9ca3af',
            padding: 12,
            font: { family: "'Space Mono', monospace", size: 10 }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.dataset.label + ': $' + ctx.raw.toFixed(2)
          }
        }
      }
    }
  });
}

/* ================================
   LINE CHART - DAILY INCOME OVER TIME
================================= */

function renderDailyIncomeLineChart(containerId = 'dailyIncomeChart') {
  const records = getFilteredRecords();
  
  if (!records || records.length === 0) return;
  
  // Group by date
  const dailyData = {};
  records.forEach(r => {
    const hours = parseFloat(r.hours) || 0;
    const rate = parseFloat(r.rate) || 0;
    const tips = parseFloat(r.tips) || 0;
    const total = (hours * rate) + tips;
    if (total > 0 && r.date) {
      dailyData[r.date] = (dailyData[r.date] || 0) + total;
    }
  });
  
  // Sort by date
  const sortedDates = Object.keys(dailyData).sort();
  
  if (sortedDates.length === 0) return;
  
  // If too many data points, aggregate by week
  let labels, data;
  if (sortedDates.length > 30) {
    // Aggregate by week
    const weeklyData = {};
    sortedDates.forEach(date => {
      const d = new Date(date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      weeklyData[weekKey] = (weeklyData[weekKey] || 0) + dailyData[date];
    });
    labels = Object.keys(weeklyData).sort().map(d => {
      const date = new Date(d);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    data = Object.values(weeklyData);
  } else {
    labels = sortedDates.map(d => {
      const date = new Date(d);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    data = sortedDates.map(d => dailyData[d]);
  }
  
  const ctx = document.getElementById(containerId);
  if (!ctx) return;
  
  const existingChart = Chart.getChart(ctx);
  if (existingChart) existingChart.destroy();
  
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Daily Income',
        data: data,
        borderColor: chartColors.primary,
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: chartColors.primary
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: '#374151' },
          ticks: { color: '#9ca3af', maxRotation: 45, font: { size: 9 } }
        },
        y: {
          grid: { color: '#374151' },
          ticks: { color: '#9ca3af', callback: v => '$' + v }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => '$' + ctx.raw.toFixed(2)
          }
        }
      }
    }
  });
}

/* ================================
   BAR CHART - HOURS BY LOCATION
================================= */

function renderHoursByLocationChart(containerId = 'hoursByLocationChart') {
  const records = getFilteredRecords();
  
  if (!records || records.length === 0) return;
  
  // Aggregate hours by location
  const locationHours = {};
  records.forEach(r => {
    const hours = parseFloat(r.hours) || 0;
    if (hours > 0) {
      locationHours[r.location] = (locationHours[r.location] || 0) + hours;
    }
  });
  
  const sortedLocations = Object.entries(locationHours)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  
  if (sortedLocations.length === 0) return;
  
  const labels = sortedLocations.map(([loc]) => loc);
  const data = sortedLocations.map(([, hours]) => hours);
  
  const ctx = document.getElementById(containerId);
  if (!ctx) return;
  
  const existingChart = Chart.getChart(ctx);
  if (existingChart) existingChart.destroy();
  
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Hours',
        data: data,
        backgroundColor: chartColors.secondary,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#9ca3af', font: { size: 10 } }
        },
        y: {
          grid: { color: '#374151' },
          ticks: { color: '#9ca3af' }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.raw.toFixed(1) + ' hours'
          }
        }
      }
    }
  });
}

/* ================================
   RENDER ALL CHARTS
================================= */

function renderAllCharts() {
  console.log('Chart global:', typeof Chart);
  
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded - CDN may be blocked');
    renderChartFallback();
    return;
  }
  
  try {
    renderLocationPieChart();
  } catch (e) { console.error('Pie chart error:', e); }
  try {
    renderTipsVsHourlyBarChart();
  } catch (e) { console.error('Bar chart error:', e); }
  try {
    renderDailyIncomeLineChart();
  } catch (e) { console.error('Line chart error:', e); }
  try {
    renderHoursByLocationChart();
  } catch (e) { console.error('Hours chart error:', e); }
}

/* ================================
   FALLBACK: TEXT-BASED CHARTS
================================= */

function renderChartFallback() {
  const records = getFilteredRecords();
  if (!records || records.length === 0) return;
  
  // Show fallback, hide canvas
  document.getElementById('chartContainers')?.classList.add('hidden');
  document.getElementById('chartFallback')?.classList.remove('hidden');
  
  // Pie fallback: by location
  const locationData = {};
  records.forEach(r => {
    const hours = parseFloat(r.hours) || 0;
    const rate = parseFloat(r.rate) || 0;
    const tips = parseFloat(r.tips) || 0;
    const total = (hours * rate) + tips;
    if (total > 0) {
      locationData[r.location] = (locationData[r.location] || 0) + total;
    }
  });
  
  const sorted = Object.entries(locationData).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const pieHtml = sorted.map(([loc, val]) => 
    `<div class="flex justify-between"><span>${loc}</span><span>$${val.toFixed(0)}</span></div>`
  ).join('');
  document.getElementById('fallbackPie').innerHTML = pieHtml || 'No data';
  
  // Bar fallback: tips vs hourly
  const hourlyTotal = records.reduce((s, r) => s + (parseFloat(r.hours) || 0) * (parseFloat(r.rate) || 0), 0);
  const tipsTotal = records.reduce((s, r) => s + (parseFloat(r.tips) || 0), 0);
  document.getElementById('fallbackBar').innerHTML = `
    <div class="flex justify-between"><span>Hourly</span><span>$${hourlyTotal.toFixed(0)}</span></div>
    <div class="flex justify-between"><span>Tips</span><span>$${tipsTotal.toFixed(0)}</span></div>
  `;
}

/* ================================
   CHART CONTROLS UI
================================= */

function renderChartControls() {
  return `
    <div class="flex gap-2 mb-4 overflow-x-auto pb-2">
      <button onclick="switchChartView('pie')" class="chart-tab flex-shrink-0 px-3 py-1.5 text-xs rounded bg-indigo-600 text-white" data-view="pie">
        By Location
      </button>
      <button onclick="switchChartView('bar')" class="chart-tab flex-shrink-0 px-3 py-1.5 text-xs rounded bg-gray-700 text-gray-300" data-view="bar">
        Tips vs Hourly
      </button>
      <button onclick="switchChartView('line')" class="chart-tab flex-shrink-0 px-3 py-1.5 text-xs rounded bg-gray-700 text-gray-300" data-view="line">
        Over Time
      </button>
      <button onclick="switchChartView('hours')" class="chart-tab flex-shrink-0 px-3 py-1.5 text-xs rounded bg-gray-700 text-gray-300" data-view="hours">
        Hours
      </button>
    </div>
  `;
}

let currentChartView = 'pie';

function switchChartView(view) {
  currentChartView = view;
  
  // Update tab styling
  document.querySelectorAll('.chart-tab').forEach(btn => {
    if (btn.dataset.view === view) {
      btn.classList.remove('bg-gray-700', 'text-gray-300');
      btn.classList.add('bg-indigo-600', 'text-white');
    } else {
      btn.classList.remove('bg-indigo-600', 'text-white');
      btn.classList.add('bg-gray-700', 'text-gray-300');
    }
  });
  
  // Show/hide chart containers
  document.getElementById('locationPieChart')?.classList.toggle('hidden', view !== 'pie');
  document.getElementById('tipsVsHourlyChart')?.classList.toggle('hidden', view !== 'bar');
  document.getElementById('dailyIncomeChart')?.classList.toggle('hidden', view !== 'line');
  document.getElementById('hoursByLocationChart')?.classList.toggle('hidden', view !== 'hours');
  
  // Re-render the active chart
  setTimeout(() => {
    if (view === 'pie') renderLocationPieChart();
    else if (view === 'bar') renderTipsVsHourlyBarChart();
    else if (view === 'line') renderDailyIncomeLineChart();
    else if (view === 'hours') renderHoursByLocationChart();
  }, 10);
}

/* ================================
   EXPORTS
================================= */

window.Chart = Chart;
window.renderAllCharts = renderAllCharts;
window.renderChartControls = renderChartControls;
window.switchChartView = switchChartView;
window.chartColors = chartColors;
