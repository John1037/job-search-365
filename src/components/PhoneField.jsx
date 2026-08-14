import { useLayoutEffect, useRef, useState } from 'react';
import { countryFlag, sortedCountries } from '../data/countries';

const TEN_DIGIT_PLACEHOLDER = '0000000000';
const SELECT_CHROME_WIDTH = 34; // padding + border + native dropdown arrow
const INPUT_CHROME_WIDTH = 22; // padding + border
const GAP = 8; // must match .phone-field gap in CSS

function PhoneField({
  countryCode,
  phoneNumber,
  onCountryChange,
  onNumberChange,
  numberInputId,
}) {
  const containerRef = useRef(null);
  const selectMeasureRef = useRef(null);
  const numberMeasureRef = useRef(null);
  const [selectWidth, setSelectWidth] = useState(null);

  const selectedCountry =
    sortedCountries.find((c) => c.code === countryCode) ?? sortedCountries[0];
  const selectedLabel = `${countryFlag(selectedCountry.code)} ${selectedCountry.name} (${selectedCountry.dial})`;

  useLayoutEffect(() => {
    function recalc() {
      if (
        !containerRef.current ||
        !selectMeasureRef.current ||
        !numberMeasureRef.current
      ) {
        return;
      }

      const containerWidth = containerRef.current.offsetWidth;
      const desiredSelectWidth =
        selectMeasureRef.current.offsetWidth + SELECT_CHROME_WIDTH;
      const minNumberWidth =
        numberMeasureRef.current.offsetWidth + INPUT_CHROME_WIDTH;
      const maxSelectWidth = containerWidth - GAP - minNumberWidth;

      setSelectWidth(Math.max(0, Math.min(desiredSelectWidth, maxSelectWidth)));
    }

    recalc();

    const observer = new ResizeObserver(recalc);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [selectedLabel]);

  return (
    <div className="phone-field" ref={containerRef}>
      <select
        className="phone-country-select"
        style={selectWidth != null ? { width: `${selectWidth}px` } : undefined}
        value={countryCode}
        onChange={(e) => onCountryChange(e.target.value)}
        aria-label="Country code"
      >
        {sortedCountries.map((country) => (
          <option key={country.code} value={country.code}>
            {countryFlag(country.code)} {country.name} ({country.dial})
          </option>
        ))}
      </select>
      <input
        id={numberInputId}
        type="tel"
        className="phone-number-input"
        value={phoneNumber}
        onChange={(e) => onNumberChange(e.target.value)}
        placeholder="Number"
      />

      {/* Off-screen elements used only to measure text width; must share font with the real controls. */}
      <span ref={selectMeasureRef} className="phone-measure">
        {selectedLabel}
      </span>
      <span ref={numberMeasureRef} className="phone-measure">
        {TEN_DIGIT_PLACEHOLDER}
      </span>
    </div>
  );
}

export default PhoneField;
