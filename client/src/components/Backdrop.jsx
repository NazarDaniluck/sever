export default function Backdrop({ style }) {
  const hasBg = style && (style.backgroundImage || style.background)
  return (
    <>
      {hasBg && <div className="backdrop" style={style} />}
      <div className="backdrop-dripper" />
    </>
  )
}