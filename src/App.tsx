import { ActiveViewProvider, useActiveView } from './contexts/ActiveViewContext';
import { AgentSessionsProvider, ChatHost } from './modules/agent';
import Config from './pages/Config';
import AgentDetail from './pages/AgentDetail';
import NewChat from './pages/NewChat';
import ChatList from './components/sidebar/ChatList';
import { Menu } from 'lucide-react';
import './index.css';

function App() {
  return (
    <ActiveViewProvider>
      <AgentSessionsProvider>
        <div id="app-container" className="flex flex-col h-screen">
          <div className="flex flex-1 overflow-hidden">
            <SidebarContainer />
            <div id="main-content" className="flex-1 h-full overflow-y-auto overflow-x-hidden">
              <MainContent />
            </div>
          </div>
        </div>
      </AgentSessionsProvider>
    </ActiveViewProvider>
  );
}

function SidebarContainer() {
  const { sidebarOpen } = useActiveView();
  
  if (!sidebarOpen) {
    return null;
  }
  
  return (
    <div className="w-80 flex-shrink-0 h-full overflow-hidden bg-[#181818]">
      <Sidebar />
    </div>
  );
}

function Sidebar() {
  const { sidebarView } = useActiveView();

  switch (sidebarView.type) {
    case 'new-chat':
      return <NewChat />;
    case 'chats':
    default:
      return <ChatList />;
  }
}

function MainContent() {
  const { activeView, sidebarOpen, setSidebarOpen } = useActiveView();

  if (!activeView) {
    return (
      <div className="h-full flex items-center justify-center bg-[#181818] relative">
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-4 left-4 p-2 text-[#888888] hover:text-white hover:bg-[#2a2a2a] rounded-full transition-colors"
            title="Open sidebar"
          >
            <Menu size={20} />
          </button>
        )}
        <div className="text-center text-[#888888]">
          <p className="text-lg text-white">Select a chat from the sidebar</p>
          <p className="text-sm mt-2">or create a new one</p>
        </div>
      </div>
    );
  }

  switch (activeView.type) {
    case 'chat':
      return <ChatHost chatId={activeView.chatId} />;
    case 'config':
      return <Config />;
    case 'agent-detail':
      return <AgentDetail agentPublicId={activeView.agentPublicId} />;
    default:
      return null;
  }
}

export default App;

