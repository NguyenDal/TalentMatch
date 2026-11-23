import React from "react";
import { FiChevronDown } from "react-icons/fi";

function SectionBody({ blocks }) {
  return <div className="tm-job-section-body">{blocks.map((block, index) => {
    if (block.type === "ul" || block.type === "ol") {
      const List = block.type;
      return <List key={index}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</List>;
    }
    return <p key={index}>{block.text}</p>;
  })}</div>;
}

export default function JobDescription({ title, description, sections }) {
  const entries = sections?.length ? sections : [{
    title: "",
    blocks: description.split(/\r?\n/).filter(line => line.trim()).map(text => ({ type: "paragraph", text })),
  }];
  const firstSection = entries.findIndex(section => section.blocks.length > 0);
  return <div className="tm-job-description" role="region" aria-label={`${title} job description`}>
    {entries.map((section, index) => {
      if (entries.length === 1 || !section.blocks.length) {
        return <div key={index} className="tm-job-static-section">
          {section.title && <h3>{section.title}</h3>}
          <SectionBody blocks={section.blocks} />
        </div>;
      }
      return <details key={index} open={index === firstSection}>
        <summary><h3>{section.title || "Overview"}</h3><FiChevronDown aria-hidden="true" /></summary>
        <SectionBody blocks={section.blocks} />
      </details>;
    })}
  </div>;
}
