import { useMemo, useState } from 'react';
import { AlertTriangle, Bolt, Calculator, MapPin } from 'lucide-react';
import './styles.css';

const states = ['CA', 'TX', 'NY', 'FL', 'IL', 'CO', 'WA', 'AZ', 'GA', 'MA'];
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export default function App() {
  const [weeklyCommuteMiles, setWeeklyCommuteMiles] = useState(160);
  const [state, setState] = useState('CA');
  const [utilityRate, setUtilityRate] = useState(0.18);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const annualCommute = useMemo(() => Math.round(Number(weeklyCommuteMiles || 0) * 52), [weeklyCommuteMiles]);

  async function submit(event) {
    event.preventDefault();
    setStatus('loading');
    setError('');
    setResult(null);
    try {
      const response = await fetch(`${apiUrl}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyCommuteMiles, state, utilityRate })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || 'Prediction failed');
      setResult(payload);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prediction failed');
      setStatus('error');
    }
  }

  return (
    <main className="shell">
      <section className="assistant">
        <div className="intro">
          <span className="eyebrow"><Bolt size={16} /> EV Transition Economics</span>
          <h1>Buying Assistant</h1>
          <p>Estimate whether an EV switch is practical for your commute and what it could save each year.</p>
        </div>

        <form className="inputPanel" onSubmit={submit}>
          <label>
            <span><Calculator size={16} /> Weekly commute mileage</span>
            <input
              type="number"
              min="1"
              max="900"
              value={weeklyCommuteMiles}
              onChange={event => setWeeklyCommuteMiles(Number(event.target.value))}
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
              min="0.05"
              max="0.8"
              step="0.01"
              value={utilityRate}
              onChange={event => setUtilityRate(Number(event.target.value))}
            />
          </label>

          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Calculating...' : 'Calculate'}
          </button>
        </form>

        <section className="outputPanel" aria-live="polite">
          {status === 'idle' && (
            <div className="placeholder">
              <strong>{annualCommute.toLocaleString()} annual miles</strong>
              <span>Run the assistant to get a model-backed estimate.</span>
            </div>
          )}

          {status === 'error' && <div className="error">{error}</div>}

          {result && (
            <div className="resultGrid">
              <div className="metric primary">
                <span>Projected annual savings</span>
                <strong>{result.formatted_annual_savings}</strong>
              </div>
              <div className="metric">
                <span>Practicality</span>
                <strong>{result.practicality_rating}</strong>
                <small>{Math.round(result.practicality_probability * 100)}% model confidence</small>
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
          )}
        </section>
      </section>
    </main>
  );
}

