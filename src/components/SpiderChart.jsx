export function ScoreBar({ score, max = 5 }) {
  const pct = Math.min(100, Math.round((score / max) * 100));
  const color = score >= 4 ? '#16a34a' : score >= 3 ? '#7c3aed' : score >= 2 ? '#d97706' : '#dc2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '99px', transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color, minWidth: '28px', textAlign: 'right' }}>{Number(score).toFixed(1)}</span>
    </div>
  );
}

export function scoreColor(v) {
  return v >= 4 ? '#16a34a' : v >= 3 ? '#7c3aed' : v >= 2 ? '#d97706' : '#dc2626';
}

export default function SpiderChart({ skills, max = 5 }) {
  if (!skills || skills.length < 2) return null;

  const skills3 = skills.length === 2
    ? [...skills, { skill: '', avg: 0, phantom: true }]
    : skills;

  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 95;
  const levels = 5;
  const n = skills3.length;

  const angleFor = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pointFor = (i, r) => ({
    x: cx + r * Math.cos(angleFor(i)),
    y: cy + r * Math.sin(angleFor(i)),
  });
  const toPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z';

  const rings = Array.from({ length: levels }, (_, l) => {
    const r = (radius * (l + 1)) / levels;
    return toPath(Array.from({ length: n }, (__, i) => pointFor(i, r)));
  });

  const axes = Array.from({ length: n }, (_, i) => {
    const o = pointFor(i, radius);
    return `M${cx},${cy} L${o.x.toFixed(2)},${o.y.toFixed(2)}`;
  });

  const dataPoints = skills3.map(({ avg }, i) => pointFor(i, (Math.min(avg, max) / max) * radius));
  const dataPath = toPath(dataPoints);

  const labelPad = 28;
  const labels = skills3.map(({ skill, avg, phantom }, i) => {
    const pt = pointFor(i, radius + labelPad);
    const cos = Math.cos(angleFor(i));
    const anchor = Math.abs(cos) < 0.12 ? 'middle' : cos > 0 ? 'start' : 'end';
    return { x: pt.x, y: pt.y, skill, avg, anchor, phantom };
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      style={{ width: '100%', maxWidth: '280px', height: 'auto', overflow: 'visible', display: 'block', margin: '0 auto' }}
    >
      {rings.map((d, i) => (
        <path key={i} d={d}
          fill={i % 2 === 0 ? 'rgba(241,245,249,0.8)' : 'rgba(248,250,252,0.4)'}
          stroke="#e2e8f0" strokeWidth="1"
        />
      ))}
      {axes.map((d, i) => (
        <path key={i} d={d} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
      ))}
      <path d={dataPath} fill="rgba(124,58,237,0.12)" stroke="none" />
      <path d={dataPath} fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinejoin="round" />
      {dataPoints.map((p, i) =>
        skills3[i].phantom ? null : (
          <circle key={i} cx={p.x} cy={p.y} r="5"
            fill={scoreColor(skills3[i].avg)} stroke="white" strokeWidth="2"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }}
          />
        )
      )}
      {labels.map(({ x, y, skill, avg, anchor, phantom }, i) =>
        phantom ? null : (
          <g key={i}>
            <text x={x} y={y - 6} fontSize="10.5" fontWeight="600" fill="#334155"
              textAnchor={anchor} dominantBaseline="middle"
              style={{ fontFamily: '-apple-system, BlinkMacSystemFont, Inter, sans-serif' }}
            >
              {skill.length > 20 ? skill.slice(0, 18) + '…' : skill}
            </text>
            <text x={x} y={y + 9} fontSize="11" fontWeight="700"
              fill={scoreColor(avg)} textAnchor={anchor} dominantBaseline="middle"
            >
              {avg.toFixed(1)}<tspan fontSize="8.5" fontWeight="500" fill="#94a3b8">/5</tspan>
            </text>
          </g>
        )
      )}
    </svg>
  );
}
