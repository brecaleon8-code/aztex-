import { Chat, Contacts, Forum, Identity } from './CommunityPage';
import './community.css';

/** Messages: your identity and contacts beside the conversation. */
export function MessagesWindow() {
  return (
    <div className="win-split messages-win">
      <div className="win-split-side">
        <Identity />
        <Contacts />
      </div>
      <Chat />
    </div>
  );
}

export function ForumWindow() {
  return <Forum />;
}
