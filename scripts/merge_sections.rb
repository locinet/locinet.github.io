require 'yaml'
require 'csv'

# Read existing topics
existing_topics = {}
if File.exist?('_data/topics.csv')
  CSV.foreach('_data/topics.csv', headers: true) do |row|
    key = "#{row['work_id']},#{row['section_id']}"
    existing_topics[key] = row['topic_ids']
  end
end

# Generate all sections
all_sections = []

Dir.glob('_data/*.yaml').each do |file|
  data = YAML.load_file(file)
  next unless data['works']
  
  data['works'].each do |work|
    work['structure'].each do |structure_item|
      next unless structure_item['children']
      
      structure_item['children'].each do |child|
        key = "#{work['id']},#{child['id']}"
        all_sections << {
          work_id: work['id'],
          section_id: child['id'],
          section_title: child['title']['en'],
          topic_ids: existing_topics[key] || ''
        }
      end
    end
  end
end

# Write to CSV
CSV.open('_data/topics.csv', 'w') do |csv|
  csv << ['work_id', 'section_id', 'section_title', 'topic_ids']
  all_sections.each do |section|
    csv << [section[:work_id], section[:section_id], section[:section_title], section[:topic_ids]]
  end
end

puts "Generated topics.csv with #{all_sections.length} sections"
puts "Preserved existing topic assignments"
