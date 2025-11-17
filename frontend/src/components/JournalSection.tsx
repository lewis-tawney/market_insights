import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import TradeLogPanel from "./TradeLogPanel";
import PlaybookPanel from "./PlaybookPanel";
import NotebookPanel from "./NotebookPanel";
import TickerProfilesPanel from "./TickerProfilesPanel";

const PANELS = [
  { value: "log", label: "Log" },
  { value: "playbook", label: "Playbook" },
  { value: "notebook", label: "Notebook" },
  { value: "profiles", label: "Profiles" },
];

export default function JournalSection() {
  const [activePanel, setActivePanel] = useState("log");

  return (
    <Card className="space-y-0">
      <Tabs value={activePanel} onValueChange={setActivePanel}> 
        <CardHeader>
          <CardTitle>Journal</CardTitle>
          <CardDescription>
            Track swing trades, document playbooks, and keep daily/weekly notes in one place.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-panel pt-0">
          <TabsList className="bg-background-raised">
            {PANELS.map((panel) => (
              <TabsTrigger key={panel.value} value={panel.value}>
                {panel.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="space-y-4 pt-4">
            <TabsContent value="log">
              <TradeLogPanel />
            </TabsContent>
            <TabsContent value="playbook">
              <PlaybookPanel />
            </TabsContent>
            <TabsContent value="notebook">
              <NotebookPanel />
            </TabsContent>
            <TabsContent value="profiles">
              <TickerProfilesPanel />
            </TabsContent>
          </div>
        </CardContent>
      </Tabs>
    </Card>
  );
}
