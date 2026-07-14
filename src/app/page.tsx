import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>QR Pagamentos</h1>
      <p>Choose an explicit locale route to continue.</p>
      <nav aria-label="Supported languages">
        <ul>
          <li>
            <Link href="/pt-BR">Português (Brasil)</Link>
          </li>
          <li>
            <Link href="/en">English</Link>
          </li>
        </ul>
      </nav>
    </main>
  );
}
