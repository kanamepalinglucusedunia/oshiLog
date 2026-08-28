import { EmptyState } from './EmptyState';
import { Header } from './Header';
import { Screen } from './Screen';

export function EntityNotFound({ entity, onBack }: { entity: string; onBack: () => void }) {
  return (
    <Screen scroll={false}>
      <Header title={`${entity} unavailable`} onBack={onBack} />
      <EmptyState
        icon="alert-circle-outline"
        title={`${entity} not found`}
        description={`It may have been archived or removed on another screen.`}
        actionLabel="Go back"
        onAction={onBack}
      />
    </Screen>
  );
}
