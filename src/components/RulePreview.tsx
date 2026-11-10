import { articlesById } from '../data/content'
import { Modal, RuleLink, Source } from './Common'
import { Markdown } from './Markdown'
import { catalog } from '../data/registry'
import { UnitPortrait } from './UnitPortrait'
export function RulePreview({ id, onClose }: { id: string; onClose: () => void }) {
  const a = articlesById.get(id)
  const profile = catalog.units.find((u) => u.ruleId === id)
  return (
    <Modal title={a?.title ?? 'Правило не найдено'} wide onClose={onClose}>
      {a && (
        <>
          <Source source={a} />
          {profile && (
            <UnitPortrait
              editionId={catalog.edition}
              unitId={profile.id}
              name={profile.name}
              className="preview-portrait"
            />
          )}
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
