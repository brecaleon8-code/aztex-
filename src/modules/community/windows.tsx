import { Chat, Contacts, Forum, Identity } from './CommunityPage';
import { PanelChromeContext } from '@/components/ui/Panel';
import './community.css';

/** Messages: your identity and contacts beside the conversation. */
export function MessagesWindow() {
  return (
    <PanelChromeContext.Provider value="window-section">
      <div className="win-split messages-win">
        <div className="win-split-side">
          <Identity />
          <Contacts />
        </div>
        <Chat />
      </div>
    </PanelChromeContext.Provider>
  );
}

export function ForumWindow() {
  return <Forum />;
}
