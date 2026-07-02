import { useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Gauge, LineChart as LineChartIcon, X } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { readInsightsPayload } from '../utils/insightsStorage';

const EV_EFFICIENCY_KWH_PER_MILE = 0.31;
const KILOMETERS_PER_100_MILES = 160.934;
const ICE_EMISSIONS_KG_PER_MILE = 0.404;
const EV_LIFECYCLE_MANUFACTURING_DEBT_TONS = 6;
const DEFAULT_GAS_VEHICLE_PRICE_USD = 33500;
const DEFAULT_GAS_VEHICLE_NAME = 'baseline gas vehicle';
const FALLBACK_EV_PURCHASE_PREMIUM_USD = 7500;
const SAVINGS_GROWTH_RATE = 0.025;

const gridCarbonIntensityByState = {
  AZ: 0.34,
  CA: 0.2,
  CO: 0.58,
  FL: 0.39,
  GA: 0.35,
  IL: 0.32,
  MA: 0.25,
  NY: 0.22,
  TX: 0.4,
  WA: 0.09,
  US: 0.39
};

const chartTheme = {
  axis: '#9fb0bb',
  grid: '#26323b',
  savings: '#8bd8bd',
  savingsAlt: '#e9c46a',
  charging: '#6fb6ff',
  chargingAlt: '#f4a261',
  combustion: '#ff9f80',
  electric: '#8bd8bd',
  tooltipBg: '#10161b',
  tooltipBorder: '#33414c'
};

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatCurrency(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits
  }).format(toFiniteNumber(value));
}

function formatYears(value) {
  if (value == null || !Number.isFinite(value)) return 'Not reached';
  if (value === 0) return 'Immediate';
  return `${value.toFixed(value < 10 ? 1 : 0)} years`;
}

function formatTons(value) {
  return `${toFiniteNumber(value).toFixed(1)} t`;
}

function extractPayload(payload) {
  const inputs = payload?.inputs ?? {};
  const outputs = payload?.mlOutputs ?? payload?.outputs ?? {};
  const selectedVehicle = payload?.selectedVehicle ?? null;
  const annualSavings = toFiniteNumber(outputs.Annual_Savings ?? outputs.annual_savings, NaN);
  const practicalityRating = outputs.Practicality_Rating ?? outputs.practicality_rating;

  if (!Number.isFinite(annualSavings) || !practicalityRating) {
    return null;
  }

  const weeklyCommuteMiles = Math.max(0, toFiniteNumber(inputs.Weekly_Commute_Miles, 0));
  const utilityRate = Math.max(0, toFiniteNumber(inputs.Utility_Rate_per_kWh, 0.17));
  const state = String(inputs.State ?? outputs.state ?? 'US').toUpperCase();
  const annualMiles = Math.max(0, toFiniteNumber(inputs.Annual_Miles, weeklyCommuteMiles * 52));
  const vehicleEfficiencyKwhPer100Km = toFiniteNumber(selectedVehicle?.efficiencyKwhPer100Km, NaN);
  const vehicleEfficiencyKwhPerMile = Number.isFinite(vehicleEfficiencyKwhPer100Km)
    ? vehicleEfficiencyKwhPer100Km / KILOMETERS_PER_100_MILES
    : EV_EFFICIENCY_KWH_PER_MILE;
  const vehicleEfficiencyKwhPer100KmDisplay = Number.isFinite(vehicleEfficiencyKwhPer100Km)
    ? vehicleEfficiencyKwhPer100Km
    : EV_EFFICIENCY_KWH_PER_MILE * KILOMETERS_PER_100_MILES;
  const vehicleBaseMsrp = toFiniteNumber(selectedVehicle?.baseMsrp, NaN);
  const purchasePremium = Number.isFinite(vehicleBaseMsrp)
    ? Math.max(vehicleBaseMsrp - DEFAULT_GAS_VEHICLE_PRICE_USD, 0)
    : FALLBACK_EV_PURCHASE_PREMIUM_USD;
  const vehicleName = selectedVehicle?.brand && selectedVehicle?.model
    ? `${selectedVehicle.brand} ${selectedVehicle.model}`
    : 'Selected EV';

  return {
    annualMiles,
    annualSavings,
    gasVehicleName: DEFAULT_GAS_VEHICLE_NAME,
    practicalityRating: String(practicalityRating),
    purchasePremium,
    selectedVehicle: selectedVehicle
      ? {
          ...selectedVehicle,
          baseMsrp: vehicleBaseMsrp,
          efficiencyKwhPer100Km: vehicleEfficiencyKwhPer100Km,
          name: vehicleName
        }
      : null,
    state,
    utilityRate,
    vehicleEfficiencyKwhPer100KmDisplay,
    vehicleEfficiencyKwhPerMile,
    vehicleName,
    weeklyCommuteMiles
  };
}

function buildFinancialTrajectory(annualSavings) {
  let cumulativeSavings = 0;
  return Array.from({ length: 10 }, (_, index) => {
    const year = index + 1;
    cumulativeSavings += annualSavings * Math.pow(1 + SAVINGS_GROWTH_RATE, index);
    return {
      year,
      cumulativeSavings: Number(cumulativeSavings.toFixed(2))
    };
  });
}

function buildChargingCosts(annualMiles, utilityRate, efficiencyKwhPerMile) {
  const annualEnergyKwh = annualMiles * efficiencyKwhPerMile;
  const publicFastRate = utilityRate * 2.4;

  return [
    {
      scenario: 'Home',
      detail: '100% home charging',
      annualCost: Number((annualEnergyKwh * utilityRate).toFixed(2))
    },
    {
      scenario: 'Mixed',
      detail: '50/50 charging mix',
      annualCost: Number((annualEnergyKwh * ((utilityRate + publicFastRate) / 2)).toFixed(2))
    },
    {
      scenario: 'Public',
      detail: '100% public fast charging',
      annualCost: Number((annualEnergyKwh * publicFastRate).toFixed(2))
    }
  ];
}

function buildDecarbonizationProjection(annualMiles, state, efficiencyKwhPerMile) {
  const gridCarbonIntensity = gridCarbonIntensityByState[state] ?? gridCarbonIntensityByState.US;
  const evEmissionsKgPerMile = gridCarbonIntensity * efficiencyKwhPerMile;
  const annualCombustionTons = (annualMiles * ICE_EMISSIONS_KG_PER_MILE) / 1000;
  const annualElectricTons = (annualMiles * evEmissionsKgPerMile) / 1000;
  const annualAvoidedTons = annualCombustionTons - annualElectricTons;

  return {
    annualAvoidedTons,
    gridCarbonIntensity,
    paybackYears: annualAvoidedTons > 0 ? EV_LIFECYCLE_MANUFACTURING_DEBT_TONS / annualAvoidedTons : null,
    data: Array.from({ length: 10 }, (_, index) => {
      const year = index + 1;
      return {
        year,
        combustion: Number((annualCombustionTons * year).toFixed(2)),
        electric: Number((EV_LIFECYCLE_MANUFACTURING_DEBT_TONS + annualElectricTons * year).toFixed(2)),
        reduction: Number((annualAvoidedTons * year - EV_LIFECYCLE_MANUFACTURING_DEBT_TONS).toFixed(2))
      };
    })
  };
}

function DarkTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chartTooltip">
      <strong>{typeof label === 'number' ? `Year ${label}` : label}</strong>
      {payload.map(item => (
        <span key={item.dataKey}>
          {item.name}: {formatter ? formatter(item.value, item.name, item.payload) : item.value}
        </span>
      ))}
    </div>
  );
}

function EmptyInsights() {
  return (
    <main className="insightsShell">
      <section className="insightsFallback">
        <span className="sectionLabel">Insights unavailable</span>
        <h1>No calculator results found</h1>
        <p>Run a calculation first, then open insights from the calculator results.</p>
        <a className="returnLink" href="/">
          <ArrowLeft size={16} />
          Back to calculator
        </a>
      </section>
    </main>
  );
}

export function InsightsDashboard() {
  const [payload] = useState(() => readInsightsPayload());
  const analytics = useMemo(() => extractPayload(payload), [payload]);

  const derived = useMemo(() => {
    if (!analytics) return null;

    const breakEvenYears =
      analytics.annualSavings > 0 ? analytics.purchasePremium / analytics.annualSavings : null;
    const decarbonization = buildDecarbonizationProjection(
      analytics.annualMiles,
      analytics.state,
      analytics.vehicleEfficiencyKwhPerMile
    );

    return {
      breakEvenYears,
      chargingCosts: buildChargingCosts(
        analytics.annualMiles,
        analytics.utilityRate,
        analytics.vehicleEfficiencyKwhPerMile
      ),
      decarbonization,
      financialTrajectory: buildFinancialTrajectory(analytics.annualSavings)
    };
  }, [analytics]);

  if (!analytics || !derived) return <EmptyInsights />;

  const visibleBreakEven =
    derived.breakEvenYears != null && derived.breakEvenYears > 0 && derived.breakEvenYears <= 10
      ? Number(derived.breakEvenYears.toFixed(2))
      : null;

  function closeAndReturn() {
    window.close();
    window.setTimeout(() => {
      window.location.assign('/');
    }, 250);
  }

  return (
    <main className="insightsShell">
      <section className="insightsDashboard">
        <header className="insightsHeader">
          <div>
            <span className="eyebrow"><BarChart3 size={16} /> EV analytics</span>
            <h1>Insights for {analytics.vehicleName}</h1>
            <p>
              {analytics.vehicleName} against {analytics.annualMiles.toLocaleString()} annual miles in {analytics.state},
              with model savings of {formatCurrency(analytics.annualSavings)} and a{' '}
              {analytics.practicalityRating.toLowerCase()} rating.
            </p>
          </div>
          <button className="closeReturnButton" type="button" onClick={closeAndReturn}>
            <X size={16} />
            Close & Return
          </button>
        </header>

        <section className="insightsSummary" aria-label="Stored model summary">
          <div>
            <span>Annual savings</span>
            <strong>{formatCurrency(analytics.annualSavings)}</strong>
          </div>
          <div>
            <span>Practicality</span>
            <strong>{analytics.practicalityRating}</strong>
          </div>
          <div>
            <span>Purchase gap break-even</span>
            <strong>{formatYears(derived.breakEvenYears)}</strong>
          </div>
          <div>
            <span>Vehicle MSRP</span>
            <strong>
              {analytics.selectedVehicle ? formatCurrency(analytics.selectedVehicle.baseMsrp) : 'Not selected'}
            </strong>
          </div>
        </section>

        <section className="insightsGrid">
          <article className="chartPanel chartPanelWide">
            <div className="chartHeader">
              <span><LineChartIcon size={16} /> 10-year horizon</span>
              <h2>Cumulative financial trajectory</h2>
            </div>
            <p className="chartContext">
              Projects your model-estimated annual savings forward for 10 years for {analytics.vehicleName}.
              The gold marker shows when cumulative savings would offset the estimated {formatCurrency(analytics.purchasePremium)}{' '}
              price gap versus the {analytics.gasVehicleName} priced at {formatCurrency(DEFAULT_GAS_VEHICLE_PRICE_USD)}.
            </p>
            <div className="chartCanvas">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={derived.financialTrajectory} margin={{ top: 18, right: 18, left: 4, bottom: 8 }}>
                  <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="year"
                    domain={[1, 10]}
                    tick={{ fill: chartTheme.axis }}
                    tickLine={false}
                    type="number"
                    allowDecimals={false}
                  />
                  <YAxis tick={{ fill: chartTheme.axis }} tickFormatter={value => `$${Math.round(value / 1000)}k`} />
                  <Tooltip content={<DarkTooltip formatter={value => formatCurrency(value)} />} />
                  {visibleBreakEven && (
                    <>
                      <ReferenceLine x={visibleBreakEven} stroke={chartTheme.savingsAlt} strokeDasharray="4 4">
                        <Label
                          value={`Break-even ${visibleBreakEven.toFixed(1)}y`}
                          position="insideTopRight"
                          fill={chartTheme.savingsAlt}
                        />
                      </ReferenceLine>
                      <ReferenceDot
                        x={visibleBreakEven}
                        y={analytics.purchasePremium}
                        r={5}
                        fill={chartTheme.savingsAlt}
                        stroke="#0d0f12"
                        ifOverflow="extendDomain"
                      />
                    </>
                  )}
                  <Line
                    type="monotone"
                    dataKey="cumulativeSavings"
                    name="Cumulative savings"
                    stroke={chartTheme.savings}
                    strokeWidth={3}
                    dot={{ r: 3, fill: chartTheme.savings }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="chartPanel">
            <div className="chartHeader">
              <span><BarChart3 size={16} /> Charging optimizer</span>
              <h2>Infrastructure cost scenarios</h2>
            </div>
            <p className="chartContext">
              Compares annual electricity cost for your {analytics.annualMiles.toLocaleString()} miles in {analytics.vehicleName}{' '}
              across home, mixed, and public fast charging. The calculation uses this model's{' '}
              {analytics.vehicleEfficiencyKwhPer100KmDisplay.toFixed(1)} kWh/100 km efficiency.
            </p>
            <div className="chartCanvas">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={derived.chargingCosts} margin={{ top: 18, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="scenario" tick={{ fill: chartTheme.axis }} tickLine={false} />
                  <YAxis tick={{ fill: chartTheme.axis }} tickFormatter={value => `$${Math.round(value)}`} />
                  <Tooltip
                    content={
                      <DarkTooltip
                        formatter={(value, name, item) => `${formatCurrency(value)} - ${item.detail}`}
                      />
                    }
                  />
                  <Bar dataKey="annualCost" name="Annual cost" fill={chartTheme.charging} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="chartPanel">
            <div className="chartHeader">
              <span><Gauge size={16} /> Decarbonization</span>
              <h2>Environmental payback</h2>
            </div>
            <p className="chartContext">
              Estimates cumulative life-cycle CO2 for a conventional vehicle versus {analytics.vehicleName}, using your
              annual mileage, this EV's efficiency, and {analytics.state} grid intensity. The EV line includes an upfront
              manufacturing emissions debt.
            </p>
            <div className="chartCanvas">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={derived.decarbonization.data} margin={{ top: 18, right: 14, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="combustionFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartTheme.combustion} stopOpacity={0.42} />
                      <stop offset="95%" stopColor={chartTheme.combustion} stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="electricFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartTheme.electric} stopOpacity={0.42} />
                      <stop offset="95%" stopColor={chartTheme.electric} stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="year" tick={{ fill: chartTheme.axis }} tickLine={false} />
                  <YAxis tick={{ fill: chartTheme.axis }} tickFormatter={value => `${Math.round(value)}t`} />
                  <Tooltip content={<DarkTooltip formatter={value => formatTons(value)} />} />
                  <Area
                    type="monotone"
                    dataKey="combustion"
                    name="Combustion life-cycle CO2"
                    stroke={chartTheme.combustion}
                    fill="url(#combustionFill)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="electric"
                    name="EV life-cycle CO2"
                    stroke={chartTheme.electric}
                    fill="url(#electricFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="chartNote">
              Grid intensity: {derived.decarbonization.gridCarbonIntensity.toFixed(2)} kg CO2/kWh. Carbon payback:{' '}
              {formatYears(derived.decarbonization.paybackYears)}.
            </p>
          </article>
        </section>
      </section>
    </main>
  );
}
