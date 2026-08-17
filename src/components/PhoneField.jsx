import { countryFlag, sortedCountries } from '../data/countries';

function PhoneField({
  countryCode,
  phoneNumber,
  onCountryChange,
  onNumberChange,
  numberInputId,
}) {
  return (
    <div className="phone-field">
      <select
        className="phone-country-select"
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
    </div>
  );
}

export default PhoneField;
