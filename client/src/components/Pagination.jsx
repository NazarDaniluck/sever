export default function Pagination({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null

  const nums = []
  const start = Math.max(1, page - 2)
  const end = Math.min(pages, page + 2)
  for (let i = start; i <= end; i++) nums.push(i)

  return (
    <div className="paginator">
      <button className="btn ghost small-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Назад</button>
      {start > 1 && (
        <>
          <button className={`btn small-btn ${page === 1 ? 'active-page' : 'ghost'}`} onClick={() => onPage(1)}>1</button>
          {start > 2 && <span className="pag-dots">…</span>}
        </>
      )}
      {nums.map(n => (
        <button key={n} className={`btn small-btn ${n === page ? 'active-page' : 'ghost'}`} onClick={() => onPage(n)}>{n}</button>
      ))}
      {end < pages && (
        <>
          {end < pages - 1 && <span className="pag-dots">…</span>}
          <button className={`btn small-btn ${page === pages ? 'active-page' : 'ghost'}`} onClick={() => onPage(pages)}>{pages}</button>
        </>
      )}
      <button className="btn ghost small-btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>Вперёд →</button>
    </div>
  )
}
