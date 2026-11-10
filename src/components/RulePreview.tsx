import { articlesById } from '../data/content'
import { Modal, RuleLink, Source } from './Common'
import { Markdown } from './Markdown'
export function RulePreview({ id, onClose }: { id: string; onClose: () => void }) {
  const a = articlesById.get(id)
  return (
    <Modal title={a?.title ?? 'Правило не найдено'} wide onClose={onClose}>
      {a && (
        <>
          <Source source={a} />
          <Markdown
            content={a.markdown.replace(/^<!--.*?-->\s*##[^\n]*\n/s, '')}
            currentId={a.id}
          />
          <RuleLink id={a.id} onClick={onClose}>
            Открыть в справочнике
          </RuleLink>
        </>
      )}
    </Modal>
  )
}
