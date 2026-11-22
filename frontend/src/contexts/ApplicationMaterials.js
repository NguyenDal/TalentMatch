import React, { createContext, useContext, useState } from "react";

const ApplicationMaterials = createContext(null);

export function ApplicationMaterialsProvider({ children }) {
  const [resumeFile, updateResume] = useState(null);
  const [jobDesc, updateDescription] = useState("");
  const [toolDrafts, setToolDrafts] = useState({});
  const [jobSearch, setJobSearch] = useState(null);

  function clearGeneratedDrafts() {
    setToolDrafts(current => current.question?.question ? { question: { question: current.question.question } } : {});
  }

  function setResumeFile(file) {
    if (file !== resumeFile) {
      updateResume(file);
      setJobSearch(null);
      clearGeneratedDrafts();
    }
  }

  function setJobDesc(description) {
    if (description !== jobDesc) {
      updateDescription(description);
      clearGeneratedDrafts();
    }
  }

  return <ApplicationMaterials.Provider value={{ resumeFile, setResumeFile, jobDesc, setJobDesc, toolDrafts, setToolDrafts, jobSearch, setJobSearch }}>
    {children}
  </ApplicationMaterials.Provider>;
}

export function useApplicationMaterials() {
  return useContext(ApplicationMaterials);
}
