import { JournalTradeCreatePayload } from "./api";

const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;

export function validateTradePayload(payload: Partial<JournalTradeCreatePayload>): string[] {
  const errors: string[] = [];
  const ticker = payload.ticker?.trim() ?? "";
  if (!ticker) {
    errors.push("Ticker is required.");
  } else if (!TICKER_PATTERN.test(ticker)) {
    errors.push("Ticker must be 1-10 uppercase letters/numbers or .-.");
  }

  if (payload.entry_price == null || Number.isNaN(payload.entry_price)) {
    errors.push("Entry price is required.");
  } else if (payload.entry_price <= 0) {
    errors.push("Entry price must be greater than 0.");
  }

  if (payload.position_size == null || Number.isNaN(payload.position_size)) {
    errors.push("Position size is required.");
  } else if (payload.position_size <= 0) {
    errors.push("Position size must be greater than 0.");
  }

  if (payload.exit_price != null && !Number.isNaN(payload.exit_price) && payload.exit_price <= 0) {
    errors.push("Exit price must be greater than 0 when provided.");
  }

  if (payload.entry_time && payload.exit_time) {
    const entry = new Date(payload.entry_time).getTime();
    const exit = new Date(payload.exit_time).getTime();
    if (!Number.isFinite(entry) || !Number.isFinite(exit)) {
      errors.push("Invalid entry or exit time.");
    } else if (exit < entry) {
      errors.push("Exit time must be after entry time.");
    }
  }

  return errors;
}
