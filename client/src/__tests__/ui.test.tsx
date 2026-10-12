import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ChartView, DataTable, EmptyState, KpiCard, inr, num, pct } from '../ui';
import { presetRange } from '../pages/Overview';
import App from '../App';
import { AuthProvider } from '../auth';

vi.mock('react-chartjs-2', () => ({ Bar: () => <div>bar-chart</div>, Line: () => <div>line-chart</div>, Pie: () => <div>pie-chart</div>, Doughnut: () => <div>doughnut-chart</div> }));
describe('formatting', () => {
  it('formats currency, numbers and percentages with null safety', () => {
    expect(inr(125000)).toBe('₹1,25,000'); expect(inr(null)).toBe('—'); expect(num(1234.5, 1)).toBe('1,234.5'); expect(pct(12.345)).toBe('12.3%'); expect(pct(undefined)).toBe('—');
  });
});
describe('components', () => {
  it('KpiCard shows value and a positive change', () => {
    render(<KpiCard label="Total Revenue" value="₹6,00,000" change={12.5} />);
    expect(screen.getByText('Total Revenue')).toBeInTheDocument(); expect(screen.getByText('₹6,00,000')).toBeInTheDocument(); expect(screen.getByText('12.5%')).toBeInTheDocument();
  });
  it('KpiCard shows a fallback when there is nothing to compare with', () => { render(<KpiCard label="Growth" value="—" change={null} />); expect(screen.getByText('No comparison')).toBeInTheDocument(); });
  it('ChartView renders an empty state when there is no data', () => { render(<ChartView type="bar" data={[]} />); expect(screen.getByText('No data for this selection')).toBeInTheDocument(); });
  it('ChartView renders the chosen chart type', () => { render(<ChartView type="line" data={[{ label: 'Jan', value: 1 }]} />); expect(screen.getByText('line-chart')).toBeInTheDocument(); });
  it('DataTable shows rows and an empty state', () => {
    const { rerender } = render(<DataTable rows={[{ a: 'x' }]} cols={[{ key: 'a', header: 'A' }]} />); expect(screen.getByText('x')).toBeInTheDocument();
    rerender(<DataTable rows={[]} cols={[{ key: 'a', header: 'A' }]} empty="Nothing here" />); expect(screen.getByText('Nothing here')).toBeInTheDocument();
    render(<EmptyState title="t" />);
  });
});
describe('date presets', () => {
  it('computes ranges relative to the latest data date', () => {
    expect(presetRange('7d', '2026-03-31')).toEqual(['2026-03-25', '2026-03-31']); expect(presetRange('month', '2026-03-15')).toEqual(['2026-03-01', '2026-03-15']);
    expect(presetRange('prevmonth', '2026-03-15')).toEqual(['2026-02-01', '2026-02-28']); expect(presetRange('quarter', '2026-05-10')).toEqual(['2026-04-01', '2026-05-10']);
    expect(presetRange('year', '2026-05-10')).toEqual(['2026-01-01', '2026-05-10']); expect(presetRange('all', '2026-05-10')).toEqual([undefined, undefined]);
  });
});
describe('routing', () => {
  it('redirects unauthenticated users to the login form', async () => {
    localStorage.clear();
    render(<MemoryRouter initialEntries={['/dashboard']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
