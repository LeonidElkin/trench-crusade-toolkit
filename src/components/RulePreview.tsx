import { articlesById } from '../data/content'
import { Modal, RuleLink, Source } from './Common'
import { Markdown } from './Markdown'
import { catalog } from '../data/registry'
import { UnitPortrait } from './UnitPortrait'
import { articleBody } from '../data/article-format'
export function RulePreview({ id, onClose }: { id: string; onClose: () => void }) {
  const a = articlesById.get(id)
  const profiles = catalog.units.filter((u) => u.ruleId === id)
  const profile = profiles.length === 1 ? profiles[0] : undefined
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
          <Markdown content={articleBody(a.markdown)} currentId={a.id} minimumHeadingLevel={3} />
          <RuleLink id={a.id} onClick={onClose}>
            Открыть в справочнике
          </RuleLink>
        </>
      )}
    </Modal>
  )
}
