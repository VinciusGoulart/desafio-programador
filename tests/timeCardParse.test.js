import { parseTimeCard } from "../src/parsers/timeCardParser.js";

test("Extrai corretamente data e horários", async () => {
  const mockText = "01/10/2025 08:00 17:00";
  const result = await parseTimeCard(mockText);
  expect(result[0].workedHours).toBeCloseTo(9);
});
