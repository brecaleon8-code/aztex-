import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NumericField } from './NumericField';

function Harness({ onValue }: { onValue: (v: number) => void }) {
  const [v, setV] = useState(64200);
  return (
    <>
      <NumericField value={v} ariaLabel="TP" onCommit={(n) => { setV(n); onValue(n); }} />
      <output data-testid="state">{String(v)}</output>
    </>
  );
}

describe('NumericField NaN guard', () => {
  it('clearing the field never commits NaN and restores the last valid value on blur', async () => {
    const commits: number[] = [];
    render(<Harness onValue={(n) => commits.push(n)} />);
    const input = screen.getByLabelText('TP');
    await userEvent.clear(input);
    expect(screen.getByTestId('state').textContent).toBe('64200');
    expect(commits.every(Number.isFinite)).toBe(true);
    await userEvent.type(input, 'abc');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('state').textContent).toBe('64200');
    await userEvent.tab();
    expect(input).toHaveValue('64200');
  });
  it('commits valid edits as numbers', async () => {
    const commits: number[] = [];
    render(<Harness onValue={(n) => commits.push(n)} />);
    const input = screen.getByLabelText('TP');
    await userEvent.clear(input);
    await userEvent.type(input, '65000.5');
    expect(screen.getByTestId('state').textContent).toBe('65000.5');
    expect(commits.at(-1)).toBe(65000.5);
  });
});
