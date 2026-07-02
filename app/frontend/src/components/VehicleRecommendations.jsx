import { BarChart3 } from 'lucide-react';

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

function formatPayback(years) {
  if (years == null) return 'Not reached with current savings';
  return `${years} years`;
}

export function VehicleRecommendations({ vehicles, insightsError, onViewInsights }) {
  return (
    <section className="recommendations" aria-labelledby="vehicle-recommendations-title">
      <div className="recommendationsHeader">
        <span className="sectionLabel">Contextual matches</span>
        <h2 id="vehicle-recommendations-title">EV recommendations</h2>
        <p>
          Ranked from the local vehicle matrix using your commute context and the model's savings and practicality output.
        </p>
        {insightsError && <p className="insightsActionError">{insightsError}</p>}
      </div>

      {vehicles.length === 0 ? (
        <p className="recommendationNotice">
          No vehicles pass the affordability and range filters yet. Try a shorter commute assumption, lower range anxiety, or a higher vehicle budget.
        </p>
      ) : (
        <div className="vehicleGrid">
          {vehicles.map(vehicle => (
            <article className="vehicleCard" key={`${vehicle.brand}-${vehicle.model}`}>
              <div className="vehicleCardTop">
                <div>
                  <span>{vehicle.brand}</span>
                  <h3>{vehicle.model}</h3>
                </div>
                <strong>{vehicle.valueScore}</strong>
              </div>

              <dl className="vehicleStats">
                <div>
                  <dt>Base MSRP</dt>
                  <dd>{formatCurrency(vehicle.baseMsrp)}</dd>
                </div>
                <div>
                  <dt>Real range</dt>
                  <dd>{vehicle.realWorldRangeKm} km</dd>
                </div>
                <div>
                  <dt>Efficiency</dt>
                  <dd>{vehicle.efficiencyKwhPer100Km} kWh/100 km</dd>
                </div>
                <div>
                  <dt>DC fast charge</dt>
                  <dd>{vehicle.maxDcFastChargingKw} kW</dd>
                </div>
              </dl>

              <div className="vehiclePayback">
                <span>Estimated break-even</span>
                <strong>{formatPayback(vehicle.estimatedBreakEvenYears)}</strong>
              </div>

              {vehicle.showBatteryWarranty && (
                <p className="warrantyNote">
                  Battery warranty: {vehicle.batteryWarrantyYears} years
                </p>
              )}

              <div className="vehicleActions">
                <button
                  className="vehicleInsightsButton"
                  type="button"
                  onClick={() => onViewInsights?.(vehicle)}
                >
                  <BarChart3 size={16} />
                  View Insights
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
