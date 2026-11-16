// Development parity tool: invokes the installed GROBID 0.9.1 classes, never product code.
package grobidparity;

import java.io.*;
import java.util.*;
import org.grobid.core.analyzers.GrobidAnalyzer;
import org.grobid.core.engines.CitationParser;
import org.grobid.core.features.FeaturesVectorCitation;
import org.grobid.core.layout.LayoutToken;
import org.grobid.core.lexicon.Lexicon;
import org.grobid.core.utilities.*;
import org.grobid.core.utilities.GrobidProperties;
import org.grobid.core.main.LibraryLoader;

public class CitationParity {
  public static void main(String[] args) throws Exception {
    GrobidProperties.setGrobidHome(args[0]);
    GrobidProperties.getInstance();
    LibraryLoader.load();
    CitationParser parser = new CitationParser(null);
    Lexicon lex = Lexicon.getInstance();
    GrobidAnalyzer analyzer = GrobidAnalyzer.getInstance();
    BufferedReader input = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
    String raw;
    while ((raw = input.readLine()) != null) {
      String clean = TextUtilities.removeLeadingAndTrailingChars(UnicodeUtil.normaliseText(raw), "[({.,])}: \n", " \n");
      List<LayoutToken> tokens = analyzer.retokenizeSubdigitsFromLayoutToken(analyzer.tokenizeWithLayoutToken(clean));
      String features = FeaturesVectorCitation.addFeaturesCitation(tokens, null,
        lex.tokenPositionsJournalNames(tokens), lex.tokenPositionsAbbrevJournalNames(tokens), lex.tokenPositionsConferenceNames(tokens),
        lex.tokenPositionsPublisherNames(tokens), lex.tokenPositionsLocationNames(tokens), lex.tokenPositionsCollaborationNames(tokens),
        lex.tokenPositionsIdentifierPattern(tokens), lex.tokenPositionsUrlPattern(tokens));
      String labeled = parser.label(features);
      System.out.println("@@@");
      for (String row : labeled.split("\\n")) if (!row.trim().isEmpty()) System.out.println(row.replace('\t', ' '));
    }
  }
}
