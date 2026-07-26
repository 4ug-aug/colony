import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

const agents = ['Software engineer']

function Home() {
  return (
    <main className="p-8">
      <div className="overflow-hidden rounded-lg border">
        <ul className="divide-y divide-border">
          {agents.map((agent) => (
            <li className="px-4 py-3" key={agent}>
              {agent}
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
