import Mention from '@tiptap/extension-mention'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i')

export function matchNames(names: string[], query: string) {
  const q = plain(query)
  const starts = names.filter((n) => plain(n).startsWith(q))
  return [...starts, ...names.filter((n) => !starts.includes(n) && plain(n).includes(q))].slice(0, 6)
}

/** `@` completion over the committee's countries. */
export const mention = (names: () => string[]) =>
  Mention.configure({
    HTMLAttributes: { class: 'mention' },
    renderText: ({ node }) => node.attrs.id,
    renderHTML: ({ options, node }) => ['span', options.HTMLAttributes, node.attrs.id],
    suggestion: {
      allowSpaces: true,
      items: ({ query }: { query: string }) => matchNames(names(), query),
      render: () => {
        let box: HTMLDivElement
        let unmount: (() => void) | undefined
        let props: SuggestionProps
        let active = 0
        const pick = (id: string) => props.command({ id })
        const draw = () => {
          box.hidden = !props.items.length
          box.replaceChildren(...(props.items as string[]).map((name, i) => {
            const b = document.createElement('button')
            b.type = 'button'
            b.textContent = name
            b.setAttribute('role', 'option')
            b.setAttribute('aria-selected', String(i === active))
            b.onmousedown = (e) => { e.preventDefault(); pick(name) }
            return b
          }))
        }
        return {
          onStart(p: SuggestionProps) {
            props = p
            active = 0
            box = document.createElement('div')
            box.className = 'mention-menu'
            box.setAttribute('role', 'listbox')
            draw()
            unmount = p.mount(box)
          },
          onUpdate(p: SuggestionProps) {
            props = p
            active = 0
            draw()
          },
          onKeyDown({ event }: SuggestionKeyDownProps) {
            const n = props.items.length
            if (!n) return false
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              active = (active + (event.key === 'ArrowDown' ? 1 : n - 1)) % n
              draw()
              return true
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              pick(props.items[active] as string)
              return true
            }
            return false
          },
          onExit() {
            unmount?.()
            box.remove()
          },
        }
      },
    },
  })
