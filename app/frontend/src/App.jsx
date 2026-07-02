import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, ArrowLeft, Bolt, Calculator, ExternalLink, MapPin } from 'lucide-react';
import { InsightsDashboard } from './components/InsightsDashboard';
import { VehicleRecommendations } from './components/VehicleRecommendations';
import { saveInsightsPayload } from './utils/insightsStorage';
import { matchVehicles } from './utils/vehicleMatcher';
import './styles.css';

const states = ['CA', 'TX', 'NY', 'FL', 'IL', 'CO', 'WA', 'AZ', 'GA', 'MA'];
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const weeklyCommuteBounds = { min: 1, max: 900 };
const utilityRateBounds = { min: 0.05, max: 0.8 };

function normalizeWholeNumberInput(value) {
  if (value === '') return '';
  return value.replace(/^0+(?=\d)/, '');
}

const explanationPages = {
  '/explain/annual-savings': {
    title: 'What projected annual savings means',
    summary: 'This number is a rough estimate of how much money you could save in one year by driving an EV instead of a gas car.',
    points: [
      'If the number is positive, the app expects the EV to cost less to run over a year.',
      'If the number is negative, the app expects the EV to cost more to run under the assumptions you entered.',
      'It is not cash you get paid. It is an estimate based on fuel costs, electricity costs, and other operating assumptions in the model.',
      'Treat it as a planning number. Real savings can change if your driving, charging access, utility rate, or local prices change.'
    ],
    sections: [
      {
        title: 'How the regression estimate is made',
        points: [
          'The app uses a regression model to predict a dollar amount called Annual_Savings. Regression means the model predicts a number, not a category.',
          'It starts from your commute, state, and electricity rate, then adds regional defaults such as gas price, charger density, incentives, and typical vehicle costs.',
          'The model also creates helper features like annual miles, gas cost per mile, EV electricity cost per mile, total incentive value, and EV price premium.',
          'Those features are passed into the trained regressor, which returns the projected yearly savings shown on the calculator.'
        ]
      },
      {
        title: 'Regression models tested',
        points: [
          'Ridge regression: a linear model that learns how strongly each feature pushes savings up or down.',
          'Decision tree regression: a rule-based model that splits drivers into groups, such as high-mileage or high-electricity-cost cases, and predicts savings for each group.',
          'XGBoost regression can also be tested when the optional XGBoost package is installed.',
          'The saved model currently used by the app is DecisionTreeRegressor.'
        ]
      }
    ]
  },
  '/explain/weekly-commute-boundary': {
    title: 'Why weekly commute mileage stops at 900',
    summary: 'This cap is a safety rail, not a claim that 900 miles is a normal weekly commute.',
    points: [
      'The app blocks extremely large values so a typo or a unit mix-up does not produce a misleading savings estimate.',
      'The model was trained on much lower commute values, so predictions become less reliable as you move far beyond typical driving patterns.',
      'In this project dataset, weekly commute mileage stays roughly between 20 and 381 miles, with the synthetic generator capped at 520.'
    ]
  },
  '/explain/utility-rate-boundary': {
    title: 'Why utility rate stops at $0.80 per kWh',
    summary: 'This cap is there to catch unrealistic or mistyped electricity prices before the model extrapolates too far.',
    points: [
      'A value above $0.80 per kWh is treated as suspicious input because it is far outside the range used to train the model.',
      'The model can still accept high prices, but once the input drifts too far from the training range the estimate becomes less defensible.',
      'In this project dataset, utility rates stay roughly between $0.08 and $0.362 per kWh, with the synthetic generator capped at $0.42.'
    ]
  },
  '/explain/model-performance': {
    title: 'Model performance',
    summary: 'This page explains how the two saved machine learning models were checked on project test data.',
    points: [
      'The app uses two model outputs: projected annual savings and practicality rating.',
      'Projected annual savings is a regression result. That means the model predicts a number in dollars per year.',
      'Practicality rating is a classification result. That means the model chooses a label, such as Practical or Challenging.',
      'These scores describe how the models behaved on this project test split. They are helpful for judging the model, but they are not a guarantee for every real-world driver.'
    ],
    sections: [
      {
        title: 'Classification model',
        points: [
          'The saved classifier is a Decision Tree. It works like a short list of if-this-then-that rules.',
          'It predicts whether the EV switch is practical for the entered situation.',
          'On the test data, accuracy, precision, recall, F1, and ROC AUC were all 1.00. In simple words, the saved classifier got every test example right.',
          'The confusion matrix was 95 correct Challenging cases and 280 correct Practical cases, with 0 wrong predictions in that test split.'
        ]
      },
      {
        title: 'Regression model',
        points: [
          'The saved regressor is also a Decision Tree. It predicts the annual savings dollar amount shown in the calculator.',
          'Its R-squared score was about 0.86. In simple words, it captured most of the savings pattern in the test data.',
          'Its MAE was about $384 per year. That means the average prediction miss was roughly $384 per year on the test data.',
          'Its RMSE was about $518 per year. This is another error score that punishes bigger misses more strongly.'
        ]
      },
      {
        title: 'Models compared',
        points: [
          'For classification, the project compared Dummy, Logistic Regression, and Decision Tree models.',
          'For regression, the project compared Dummy, Ridge Regression, and Decision Tree models.',
          'The Decision Tree versions were saved because they performed best on this project data.'
        ]
      }
    ]
  }
};

function getRoute() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/insights') return '/insights';

  const route = window.location.hash.replace(/^#/, '');
  return route || '/';
}

function buildValidationIssues(weeklyCommuteMiles, utilityRate) {
  const issues = [];

  if (!Number.isFinite(weeklyCommuteMiles)) {
    issues.push({
      field: 'weeklyCommuteMiles',
      message: 'Weekly commute mileage must be a valid number.'
    });
  } else if (weeklyCommuteMiles < weeklyCommuteBounds.min) {
    issues.push({
      field: 'weeklyCommuteMiles',
      message: `Weekly commute mileage must be at least ${weeklyCommuteBounds.min}.`
    });
  } else if (weeklyCommuteMiles > weeklyCommuteBounds.max) {
    issues.push({
      field: 'weeklyCommuteMiles',
      message: `Weekly commute mileage must be ${weeklyCommuteBounds.max} or lower.`,
      href: '#/explain/weekly-commute-boundary',
      linkText: 'Why this boundary exists'
    });
  }

  if (utilityRate < utilityRateBounds.min) {
    issues.push({
      field: 'utilityRate',
      message: `Utility rate must be at least $${utilityRateBounds.min.toFixed(2)} per kWh.`
    });
  } else if (utilityRate > utilityRateBounds.max) {
    issues.push({
      field: 'utilityRate',
      message: `Utility rate must be $${utilityRateBounds.max.toFixed(2)} per kWh or lower.`,
      href: '#/explain/utility-rate-boundary',
      linkText: 'Why this boundary exists'
    });
  }

  return issues;
}

function ExplanationPage({ page }) {
  return (
    <main className="shell">
      <section className="explanationPage">
        <a className="backLink" href="#/">
          <ArrowLeft size={16} />
          Back to calculator
        </a>
        <div className="intro explanationIntro">
          <span className="eyebrow"><Bolt size={16} /> Explanation</span>
          <h1>{page.title}</h1>
          <p>{page.summary}</p>
        </div>
        <section className="explanationCard">
          {page.points.map(point => (
            <p key={point}>{point}</p>
          ))}

          {page.sections?.map(section => (
            <div className="explanationSection" key={section.title}>
              <h2>{section.title}</h2>
              {section.points.map(point => (
                <p key={point}>{point}</p>
              ))}
            </div>
          ))}

        </section>
      </section>
    </main>
  );
}

function CalculatorPage() {
  const [weeklyCommuteMilesInput, setWeeklyCommuteMilesInput] = useState('160');
  const [state, setState] = useState('CA');
  const [utilityRate, setUtilityRate] = useState(0.18);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [insightsError, setInsightsError] = useState(null);

  const weeklyCommuteMiles = Number(weeklyCommuteMilesInput || 0);
  const annualCommute = useMemo(() => Math.round(Number(weeklyCommuteMiles || 0) * 52), [weeklyCommuteMiles]);
  const hasValidInsights = Boolean(
    result && Number.isFinite(Number(result.annual_savings)) && result.practicality_rating
  );
  const recommendedVehicles = useMemo(() => {
    if (!result) return [];

    return matchVehicles(
      {
        weeklyCommuteMiles,
        state,
        utilityRate,
        infrastructureDensity: result.infrastructure_density_per_100k,
        infrastructureWarning: result.infrastructure_warning
      },
      {
        annual_savings: result.annual_savings,
        practicality_rating: result.practicality_rating,
        infrastructure_density_per_100k: result.infrastructure_density_per_100k,
        infrastructure_warning: result.infrastructure_warning
      }
    );
  }, [result, state, utilityRate, weeklyCommuteMiles]);

  async function submit(event) {
    event.preventDefault();
    const validationIssues = buildValidationIssues(weeklyCommuteMiles, utilityRate);
    if (validationIssues.length > 0) {
      setError({ type: 'validation', issues: validationIssues });
      setResult(null);
      setStatus('error');
      return;
    }
    setStatus('loading');
    setError(null);
    setInsightsError(null);
    setResult(null);
    try {
      const response = await fetch(`${apiUrl}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Weekly_Commute_Miles: weeklyCommuteMiles,
          State: state,
          Utility_Rate_per_kWh: utilityRate
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || 'Prediction failed');
      setResult(payload);
      setStatus('ready');
    } catch (err) {
      setError({ type: 'request', message: err instanceof Error ? err.message : 'Prediction failed' });
      setStatus('error');
    }
  }

  function openInsights(vehicle) {
    if (!hasValidInsights || !vehicle) return;

    const activeUserInputPayload = {
      Weekly_Commute_Miles: Number(weeklyCommuteMiles),
      State: state,
      Utility_Rate_per_kWh: Number(utilityRate)
    };
    const insightsPayload = {
      namespace: 'ev-transition:insights:v1',
      storedAt: new Date().toISOString(),
      inputs: activeUserInputPayload,
      selectedVehicle: {
        brand: vehicle.brand,
        model: vehicle.model,
        baseMsrp: Number(vehicle.baseMsrp),
        estimatedNetPurchasePrice: Number(vehicle.estimatedNetPurchasePrice ?? vehicle.baseMsrp),
        estimatedBreakEvenYears: vehicle.estimatedBreakEvenYears,
        realWorldRangeKm: Number(vehicle.realWorldRangeKm),
        efficiencyKwhPer100Km: Number(vehicle.efficiencyKwhPer100Km),
        batteryWarrantyYears: Number(vehicle.batteryWarrantyYears),
        maxDcFastChargingKw: Number(vehicle.maxDcFastChargingKw),
        valueScore: Number(vehicle.valueScore)
      },
      mlOutputs: {
        Annual_Savings: Number(result.annual_savings),
        Practicality_Rating: result.practicality_rating,
        annual_savings: Number(result.annual_savings),
        formatted_annual_savings: result.formatted_annual_savings,
        practicality_probability: Number(result.practicality_probability),
        infrastructure_density_per_100k: Number(result.infrastructure_density_per_100k),
        infrastructure_warning: Boolean(result.infrastructure_warning),
        gas_price_per_gallon: Number(result.gas_price_per_gallon),
        state: result.state
      }
    };

    if (!saveInsightsPayload(insightsPayload)) {
      setInsightsError('Insights could not be saved in this browser session.');
      return;
    }

    setInsightsError(null);
    const link = document.createElement('a');
    link.href = `${window.location.origin}/insights`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <main className="shell">
      <section className="assistant">
        <div className="intro">
          <span className="eyebrow"><Bolt size={16} /> EV Transition Economics</span>
          <h1>Buying Assistant</h1>
          <p>Estimate whether an EV switch is practical for your commute and what it could save each year.</p>
        </div>

        <form className="inputPanel" onSubmit={submit} noValidate>
          <label>
            <span><Calculator size={16} /> Weekly commute mileage</span>
            <input
              type="number"
              min={weeklyCommuteBounds.min}
              max={weeklyCommuteBounds.max}
              value={weeklyCommuteMilesInput}
              onChange={event => setWeeklyCommuteMilesInput(normalizeWholeNumberInput(event.target.value))}
            />
          </label>

          <label>
            <span><MapPin size={16} /> State</span>
            <select value={state} onChange={event => setState(event.target.value)}>
              {states.map(code => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>

          <label>
            <span><Bolt size={16} /> Utility rate ($/kWh)</span>
            <input
              type="number"
              min={utilityRateBounds.min}
              max={utilityRateBounds.max}
              step="0.01"
              value={utilityRate}
              onChange={event => setUtilityRate(Number(event.target.value))}
            />
          </label>

          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Calculating...' : 'Calculate'}
          </button>

          <a className="modelPerformanceLink" href="#/explain/model-performance">
            Model performance
          </a>
        </form>

        <section className="outputPanel" aria-live="polite">
          {status === 'idle' && (
            <div className="placeholder">
              <strong>{annualCommute.toLocaleString()} annual miles</strong>
              <span>Run the assistant to get a model-backed estimate.</span>
            </div>
          )}

          {status === 'error' && error?.type === 'request' && <div className="error">{error.message}</div>}

          {status === 'error' && error?.type === 'validation' && (
            <div className="error errorStack">
              {error.issues.map(issue => (
                <p key={`${issue.field}-${issue.message}`}>
                  {issue.message}{' '}
                  {issue.href && (
                    <a className="errorLink" href={issue.href}>
                      {issue.linkText}
                      <ExternalLink size={14} />
                    </a>
                  )}
                </p>
              ))}
            </div>
          )}

          {result && (
            <>
              <div className="resultGrid">
                <div className="metric primary">
                  <span>Projected annual savings</span>
                  <strong>{result.formatted_annual_savings}</strong>
                  <p className="metricAssumption">
                    This estimate assumes gas costs ${Number(result.gas_price_per_gallon).toFixed(2)} per gallon in {result.state}.
                  </p>
                  <a className="metricLink" href="#/explain/annual-savings">
                    What does this number mean?
                    <ExternalLink size={14} />
                  </a>
                </div>
                <div className="metric">
                  <span>Practicality</span>
                  <strong>{result.practicality_rating}</strong>
                </div>
                <div className="metric">
                  <span>Infrastructure density</span>
                  <strong>{result.infrastructure_density_per_100k}</strong>
                  <small>chargers per 100k residents</small>
                </div>
                {result.infrastructure_warning && (
                  <div className="warning">
                    <AlertTriangle size={18} />
                    Local charging density is below the safety threshold for this commute. Confirm home charging or nearby fast charging before buying.
                  </div>
                )}
              </div>
              <VehicleRecommendations
                vehicles={recommendedVehicles}
                insightsError={insightsError}
                onViewInsights={openInsights}
              />
            </>
          )}
        </section>
      </section>
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    function handleRouteChange() {
      setRoute(getRoute());
    }

    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  const page = explanationPages[route];
  if (route === '/insights') {
    return <InsightsDashboard />;
  }

  if (page) {
    return <ExplanationPage page={page} />;
  }

  return <CalculatorPage />;
}

createRoot(document.getElementById('root')).render(<App />);
