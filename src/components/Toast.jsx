export default function Toast({ message }) {
  if (!message) return null;
  return <div className="toast glass-dark">{message}</div>;
}
